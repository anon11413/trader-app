/**
 * Instrument definitions and price computation.
 * Mirrors the exact formulas from the web dashboard's instruments.js:
 *   PRICE_DIVISOR = 20, ETF_UNITS = 100_000, INDEX_BASE = 1000
 */
import { getOhlcv, getBalanceSheet, OhlcvData, BalanceSheetData } from './api';

export const PRICE_DIVISOR = 20;
export const ETF_UNITS = 100_000;
export const INDEX_BASE = 1000;

export const CURRENCIES = ['EUR', 'USD', 'YEN'] as const;
export type Currency = typeof CURRENCIES[number];

export interface InstrumentDef {
  id: string;
  name: string;
  section: 'market_prices' | 'sector_equity' | 'etfs_index';
  /** If true, the forex instrument is skipped when from-currency matches */
  skipSameCurrency?: string;
}

export const INSTRUMENT_DEFS: InstrumentDef[] = [
  { id: 'MACHINE', name: 'Machine Price', section: 'market_prices' },
  { id: 'FOREX_USD', name: 'USD', section: 'market_prices', skipSameCurrency: 'USD' },
  { id: 'FOREX_YEN', name: 'YEN', section: 'market_prices', skipSameCurrency: 'YEN' },
  { id: 'HOUSEHOLD_EQUITY', name: 'Household Equity', section: 'sector_equity' },
  { id: 'CREDITBANK_MA', name: 'Credit Bank 190d MA', section: 'sector_equity' },
  { id: 'INDUSTRIAL_ETF', name: 'Industrial ETF', section: 'etfs_index' },
  { id: 'BROAD_MARKET_ETF', name: 'Broad Market ETF', section: 'etfs_index' },
];

export interface InstrumentPrice {
  id: string;
  name: string;
  section: string;
  currency: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  sparkline: number[];  // last ~50 price points for mini chart
}

/** Compute 190-day simple moving average, returns the last value */
function computeMA(values: number[], period: number): number {
  if (values.length < period) return values[values.length - 1] ?? 0;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) {
    sum += (values[i] || 0);
  }
  return sum / period;
}

/** Get last N values as sparkline */
function sparkline(values: number[], n: number = 50): number[] {
  return values.slice(Math.max(0, values.length - n));
}

/** Compute current price and sparkline for one instrument in one currency */
export async function getInstrumentPrice(
  instrumentId: string, currency: Currency
): Promise<InstrumentPrice | null> {
  const def = INSTRUMENT_DEFS.find(d => d.id === instrumentId);
  if (!def) return null;

  // Skip forex pair if viewing same currency
  if (def.skipSameCurrency === currency) return null;

  try {
    let prices: number[];
    let name = def.name;

    switch (instrumentId) {
      case 'MACHINE': {
        const data = await getOhlcv(currency, 'good', 'MACHINE');
        prices = data.close;
        break;
      }
      case 'FOREX_USD': {
        const data = await getOhlcv(currency, 'currency', 'USD');
        prices = data.close;
        name = `USD/${currency}`;
        break;
      }
      case 'FOREX_YEN': {
        const data = await getOhlcv(currency, 'currency', 'YEN');
        prices = data.close;
        name = `YEN/${currency}`;
        break;
      }
      case 'HOUSEHOLD_EQUITY': {
        const data = await getBalanceSheet(currency, 'Household');
        prices = data.equity.map(eq => Math.max(0, eq) / PRICE_DIVISOR);
        break;
      }
      case 'CREDITBANK_MA': {
        const data = await getBalanceSheet(currency, 'CreditBank');
        const raw = data.equity.map(eq => Math.max(0, eq) / PRICE_DIVISOR);
        // Build MA series
        const maSeries: number[] = [];
        let sum = 0;
        for (let i = 0; i < raw.length; i++) {
          sum += (raw[i] || 0);
          if (i >= 190) sum -= (raw[i - 190] || 0);
          if (i >= 189) maSeries.push(sum / 190);
          else maSeries.push(raw[i]);
        }
        prices = maSeries;
        break;
      }
      case 'INDUSTRIAL_ETF': {
        const data = await getBalanceSheet(currency, 'Factory');
        prices = data.equity.map(eq => Math.max(0, eq) / ETF_UNITS);
        break;
      }
      case 'BROAD_MARKET_ETF': {
        const data = await getBalanceSheet(currency, 'National');
        const base = Math.max(1, data.equity[0] || 1);
        prices = data.equity.map(eq => (Math.max(0, eq) / base) * INDEX_BASE);
        break;
      }
      default:
        return null;
    }

    if (!prices || prices.length === 0) return null;

    const currentPrice = prices[prices.length - 1] ?? 0;
    const prevClose = prices.length >= 2 ? (prices[prices.length - 2] ?? currentPrice) : currentPrice;
    const change = currentPrice - prevClose;
    const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

    return {
      id: instrumentId,
      name,
      section: def.section,
      currency,
      price: currentPrice,
      previousClose: prevClose,
      change,
      changePercent,
      sparkline: sparkline(prices),
    };
  } catch (e) {
    console.warn(`Failed to get price for ${instrumentId}/${currency}:`, e);
    return null;
  }
}

/** Get all instrument prices for a given currency */
export async function getAllPrices(currency: Currency): Promise<InstrumentPrice[]> {
  const results = await Promise.all(
    INSTRUMENT_DEFS.map(def => getInstrumentPrice(def.id, currency))
  );
  return results.filter((r): r is InstrumentPrice => r !== null);
}

/** Get exchange rate between two currencies (e.g., EUR -> USD) */
export async function getExchangeRate(from: Currency, to: Currency): Promise<number> {
  if (from === to) return 1.0;
  try {
    // Get the price of 'to' currency denominated in 'from' currency
    const data = await getOhlcv(from, 'currency', to);
    return data.close[data.close.length - 1] ?? 1.0;
  } catch {
    return 1.0;
  }
}

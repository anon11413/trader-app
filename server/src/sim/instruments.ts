/**
 * Instrument definitions and price computation.
 * Core instruments: Broad Market ETF, Credit Bank 190d MA, Machine Price
 * Plus dynamic commodity discovery and forex rates.
 */
import { getOhlcv, getBalanceSheet, getOhlcvAssets, OhlcvData, BalanceSheetData } from './api';

export const PRICE_DIVISOR = 20;
export const ETF_UNITS = 100_000;
export const INDEX_BASE = 1000;

export const CURRENCIES = ['EUR', 'USD', 'YEN'] as const;
export type Currency = typeof CURRENCIES[number];

export type InstrumentSection = 'market_prices' | 'credit_bank' | 'etfs' | 'commodities' | 'forex';

export interface InstrumentDef {
  id: string;
  name: string;
  section: InstrumentSection;
  /** If true, the forex instrument is skipped when from-currency matches */
  skipSameCurrency?: string;
}

/** Core instruments — ETFs, Credit Bank, Machine Price only */
export const INSTRUMENT_DEFS: InstrumentDef[] = [
  { id: 'BROAD_MARKET_ETF', name: 'Broad Market ETF', section: 'etfs' },
  { id: 'CREDITBANK_MA', name: 'Credit Bank 190d MA', section: 'credit_bank' },
  { id: 'MACHINE', name: 'Machine Price', section: 'market_prices' },
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

/** Build an InstrumentPrice from a price array */
function buildInstrumentPrice(
  id: string, name: string, section: InstrumentSection,
  currency: string, prices: number[]
): InstrumentPrice | null {
  if (!prices || prices.length === 0) return null;

  const currentPrice = prices[prices.length - 1] ?? 0;
  const prevClose = prices.length >= 2 ? (prices[prices.length - 2] ?? currentPrice) : currentPrice;
  const change = currentPrice - prevClose;
  const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

  return {
    id,
    name,
    section,
    currency,
    price: currentPrice,
    previousClose: prevClose,
    change,
    changePercent,
    sparkline: sparkline(prices),
  };
}

/** Compute current price and sparkline for one core instrument in one currency */
export async function getInstrumentPrice(
  instrumentId: string, currency: Currency
): Promise<InstrumentPrice | null> {
  const def = INSTRUMENT_DEFS.find(d => d.id === instrumentId);

  // Handle dynamic GOOD_* instruments
  if (instrumentId.startsWith('GOOD_')) {
    return getCommodityInstrumentPrice(currency, instrumentId.replace('GOOD_', ''));
  }

  if (!def) return null;

  try {
    let prices: number[];
    let name = def.name;

    switch (instrumentId) {
      case 'MACHINE': {
        const data = await getOhlcv(currency, 'good', 'MACHINE');
        prices = data.close;
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
      case 'BROAD_MARKET_ETF': {
        const data = await getBalanceSheet(currency, 'National');
        const base = Math.max(1, data.equity[0] || 1);
        prices = data.equity.map(eq => (Math.max(0, eq) / base) * INDEX_BASE);
        break;
      }
      default:
        return null;
    }

    return buildInstrumentPrice(instrumentId, name, def.section, currency, prices);
  } catch (e) {
    console.warn(`Failed to get price for ${instrumentId}/${currency}:`, e);
    return null;
  }
}

/** Get all core instrument prices for a given currency (ETF, Credit Bank, Machine) */
export async function getAllPrices(currency: Currency): Promise<InstrumentPrice[]> {
  const results = await Promise.all(
    INSTRUMENT_DEFS.map(def => getInstrumentPrice(def.id, currency))
  );
  return results.filter((r): r is InstrumentPrice => r !== null);
}

// --- Commodity Discovery ---

/** Goods to exclude from commodities (already in core instruments) */
const EXCLUDED_GOODS = new Set(['MACHINE']);

/** Prettify a good name: COTTON -> Cotton, REALESTATE -> Real Estate */
function prettifyGoodName(name: string): string {
  const special: Record<string, string> = {
    REALESTATE: 'Real Estate',
    LABOURHOUR: 'Labour Hour',
    KILOWATT: 'Kilowatt',
  };
  if (special[name]) return special[name];
  return name.charAt(0) + name.slice(1).toLowerCase();
}

/** Discover all commodity goods from the simulation for a currency */
export async function discoverCommodityGoods(currency: Currency): Promise<string[]> {
  try {
    const result = await getOhlcvAssets(currency);
    const assets = result.assets || [];
    return assets
      .filter((a: any) => a.assetType === 'good' && !EXCLUDED_GOODS.has(a.assetName))
      .map((a: any) => a.assetName);
  } catch (e) {
    console.warn(`Failed to discover commodities for ${currency}:`, e);
    return [];
  }
}

/** Get price for a single commodity good */
export async function getCommodityInstrumentPrice(
  currency: Currency, goodName: string
): Promise<InstrumentPrice | null> {
  try {
    const data = await getOhlcv(currency, 'good', goodName);
    const id = `GOOD_${goodName}`;
    const name = prettifyGoodName(goodName);
    return buildInstrumentPrice(id, name, 'commodities', currency, data.close);
  } catch (e) {
    console.warn(`Failed to get commodity price for ${goodName}/${currency}:`, e);
    return null;
  }
}

/** Get all commodity prices for a currency */
export async function getAllCommodityPrices(currency: Currency): Promise<InstrumentPrice[]> {
  const goods = await discoverCommodityGoods(currency);
  const results = await Promise.all(
    goods.map(good => getCommodityInstrumentPrice(currency, good))
  );
  return results.filter((r): r is InstrumentPrice => r !== null);
}

// --- Forex ---

/** Get forex instrument prices for a currency */
export async function getForexPrices(currency: Currency): Promise<InstrumentPrice[]> {
  const forexTargets = CURRENCIES.filter(c => c !== currency);
  const results = await Promise.all(
    forexTargets.map(async (target) => {
      try {
        const data = await getOhlcv(currency, 'currency', target);
        const id = `FOREX_${target}`;
        const name = `${target}/${currency}`;
        return buildInstrumentPrice(id, name, 'forex', currency, data.close);
      } catch (e) {
        console.warn(`Failed to get forex ${target}/${currency}:`, e);
        return null;
      }
    })
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

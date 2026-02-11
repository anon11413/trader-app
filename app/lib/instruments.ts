/**
 * Client-side instrument definitions — mirrors server instrument defs.
 * Used for display names, sections, icons, and formatting.
 */

export const PRICE_DIVISOR = 20;
export const ETF_UNITS = 100_000;
export const INDEX_BASE = 1000;

export const CURRENCIES = ['EUR', 'USD', 'YEN'] as const;
export type Currency = typeof CURRENCIES[number];

export interface InstrumentDef {
  id: string;
  name: string;
  section: 'market_prices' | 'sector_equity' | 'etfs_index';
  description: string;
  /** If set, skip this instrument when viewing the specified currency */
  skipSameCurrency?: string;
  /** True if this instrument uses native OHLCV data (candlestick-capable) */
  isOhlcv: boolean;
}

export const INSTRUMENTS: InstrumentDef[] = [
  {
    id: 'MACHINE',
    name: 'Machine Price',
    section: 'market_prices',
    description: 'OHLCV market price of machines',
    isOhlcv: true,
  },
  {
    id: 'FOREX_USD',
    name: 'USD',
    section: 'market_prices',
    description: 'USD exchange rate',
    skipSameCurrency: 'USD',
    isOhlcv: true,
  },
  {
    id: 'FOREX_YEN',
    name: 'YEN',
    section: 'market_prices',
    description: 'YEN exchange rate',
    skipSameCurrency: 'YEN',
    isOhlcv: true,
  },
  {
    id: 'HOUSEHOLD_EQUITY',
    name: 'Household Equity',
    section: 'sector_equity',
    description: 'Aggregate household equity / 20',
    isOhlcv: false,
  },
  {
    id: 'CREDITBANK_MA',
    name: 'Credit Bank 190d MA',
    section: 'sector_equity',
    description: '190-day moving average of credit bank equity / 20',
    isOhlcv: false,
  },
  {
    id: 'INDUSTRIAL_ETF',
    name: 'Industrial ETF',
    section: 'etfs_index',
    description: 'Factory equity / 100,000',
    isOhlcv: false,
  },
  {
    id: 'BROAD_MARKET_ETF',
    name: 'Broad Market ETF',
    section: 'etfs_index',
    description: 'National equity index (base 1000)',
    isOhlcv: false,
  },
];

/**
 * Get instrument definition by ID.
 */
export function getInstrument(id: string): InstrumentDef | undefined {
  return INSTRUMENTS.find(i => i.id === id);
}

/**
 * Get instruments visible for a given currency.
 */
export function getInstrumentsForCurrency(currency: Currency): InstrumentDef[] {
  return INSTRUMENTS.filter(i => i.skipSameCurrency !== currency);
}

/**
 * Get display name for an instrument in a specific currency context.
 */
export function getInstrumentDisplayName(id: string, currency: string): string {
  switch (id) {
    case 'FOREX_USD': return `USD/${currency}`;
    case 'FOREX_YEN': return `YEN/${currency}`;
    default: {
      const def = getInstrument(id);
      return def?.name ?? id;
    }
  }
}

/**
 * Section titles for grouping instruments.
 */
export const SECTION_TITLES: Record<string, string> = {
  market_prices: 'Market Prices',
  sector_equity: 'Sector Equity',
  etfs_index: 'ETFs & Index',
};

/**
 * Group instruments by section for a given currency.
 */
export function getInstrumentsBySection(currency: Currency): Record<string, InstrumentDef[]> {
  const instruments = getInstrumentsForCurrency(currency);
  const grouped: Record<string, InstrumentDef[]> = {};
  for (const inst of instruments) {
    if (!grouped[inst.section]) grouped[inst.section] = [];
    grouped[inst.section].push(inst);
  }
  return grouped;
}

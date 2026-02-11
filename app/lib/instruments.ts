/**
 * Client-side instrument definitions — mirrors server instrument defs.
 * Core: Broad Market ETF, Credit Bank 190d MA, Machine Price
 * Plus dynamic commodities and forex (fetched from server).
 */

export const PRICE_DIVISOR = 20;
export const ETF_UNITS = 100_000;
export const INDEX_BASE = 1000;

export const CURRENCIES = ['EUR', 'USD', 'YEN'] as const;
export type Currency = typeof CURRENCIES[number];

export type InstrumentSection = 'etfs' | 'credit_bank' | 'market_prices' | 'commodities' | 'forex';

export interface InstrumentDef {
  id: string;
  name: string;
  section: InstrumentSection;
  description: string;
  /** If set, skip this instrument when viewing the specified currency */
  skipSameCurrency?: string;
  /** True if this instrument uses native OHLCV data (candlestick-capable) */
  isOhlcv: boolean;
}

/** Core instruments — only ETF, Credit Bank, Machine */
export const INSTRUMENTS: InstrumentDef[] = [
  {
    id: 'BROAD_MARKET_ETF',
    name: 'Broad Market ETF',
    section: 'etfs',
    description: 'National equity index (base 1000)',
    isOhlcv: false,
  },
  {
    id: 'CREDITBANK_MA',
    name: 'Credit Bank 190d MA',
    section: 'credit_bank',
    description: '190-day moving average of credit bank equity / 20',
    isOhlcv: false,
  },
  {
    id: 'MACHINE',
    name: 'Machine Price',
    section: 'market_prices',
    description: 'OHLCV market price of machines',
    isOhlcv: true,
  },
];

/**
 * Get instrument definition by ID.
 * Handles both core instruments and dynamic GOOD_x and FOREX_x instruments.
 */
export function getInstrument(id: string): InstrumentDef | undefined {
  // Check core instruments first
  const core = INSTRUMENTS.find(i => i.id === id);
  if (core) return core;

  // Dynamic commodities
  if (id.startsWith('GOOD_')) {
    return {
      id,
      name: prettifyGoodName(id.replace('GOOD_', '')),
      section: 'commodities',
      description: 'Commodity price',
      isOhlcv: true,
    };
  }

  // Dynamic forex
  if (id.startsWith('FOREX_')) {
    return {
      id,
      name: id.replace('FOREX_', ''),
      section: 'forex',
      description: 'Exchange rate',
      isOhlcv: true,
    };
  }

  return undefined;
}

/**
 * Prettify a good name: COTTON -> Cotton, REALESTATE -> Real Estate
 */
function prettifyGoodName(name: string): string {
  const special: Record<string, string> = {
    REALESTATE: 'Real Estate',
    LABOURHOUR: 'Labour Hour',
    KILOWATT: 'Kilowatt',
  };
  if (special[name]) return special[name];
  return name.charAt(0) + name.slice(1).toLowerCase();
}

/**
 * Get instruments visible for a given currency (core only).
 */
export function getInstrumentsForCurrency(currency: Currency): InstrumentDef[] {
  return INSTRUMENTS.filter(i => i.skipSameCurrency !== currency);
}

/**
 * Get display name for an instrument in a specific currency context.
 */
export function getInstrumentDisplayName(id: string, currency: string): string {
  if (id.startsWith('FOREX_')) {
    const target = id.replace('FOREX_', '');
    return `${target}/${currency}`;
  }
  if (id.startsWith('GOOD_')) {
    return prettifyGoodName(id.replace('GOOD_', ''));
  }
  const def = getInstrument(id);
  return def?.name ?? id;
}

/**
 * Section titles for grouping instruments.
 */
export const SECTION_TITLES: Record<string, string> = {
  etfs: 'ETFs & Index',
  credit_bank: 'Credit & Banking',
  market_prices: 'Market Prices',
  commodities: 'Commodities',
  forex: 'Forex',
};

/**
 * Section order for display.
 */
export const SECTION_ORDER: InstrumentSection[] = [
  'etfs',
  'credit_bank',
  'market_prices',
  'commodities',
];

/**
 * Group core instruments by section for a given currency.
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

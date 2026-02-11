/**
 * Simulation API proxy with TTL cache.
 * Fetches OHLCV prices, balance sheets, and metadata from the
 * existing computational economy simulation running on Render.
 */
import { config } from '../config/env';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

async function cachedFetch<T>(path: string, ttlMs: number): Promise<T> {
  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T;
  }
  const url = `${config.SIM_API_URL}${path}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Sim API ${resp.status}: ${url}`);
  }
  const data = await resp.json() as T;
  cache.set(path, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

export function clearCache() {
  cache.clear();
}

// --- Types ---

export interface OhlcvData {
  dates: string[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
}

export interface BalanceSheetData {
  dates: string[];
  equity: number[];
  hardCash: number[];
  cashGiroShort: number[];
  cashGiroLong: number[];
  bonds: number[];
  bankLoans: number[];
  inventoryValue: number[];
  loansGiroShort: number[];
  loansGiroLong: number[];
  financialLiabilities: number[];
  bankBorrowings: number[];
}

export interface TimeSeriesData {
  series: Record<string, { dates: string[]; values: number[] }>;
}

export interface OhlcvAsset {
  assetType: string;
  assetName: string;
}

// --- Public API ---

const PRICE_TTL = 30_000;    // 30 seconds
const METADATA_TTL = 300_000; // 5 minutes

export async function getOhlcv(
  currency: string, assetType: string, assetName: string,
  from?: string, to?: string
): Promise<OhlcvData> {
  let path = `/api/ohlcv/${currency}/${assetType}/${assetName}`;
  const params: string[] = [];
  if (from) params.push(`from=${from}`);
  if (to) params.push(`to=${to}`);
  if (params.length) path += '?' + params.join('&');
  return cachedFetch<OhlcvData>(path, PRICE_TTL);
}

export async function getBalanceSheet(
  currency: string, agentType: string,
  from?: string, to?: string
): Promise<BalanceSheetData> {
  let path = `/api/balance-sheets/${currency}/${agentType}`;
  const params: string[] = [];
  if (from) params.push(`from=${from}`);
  if (to) params.push(`to=${to}`);
  if (params.length) path += '?' + params.join('&');
  return cachedFetch<BalanceSheetData>(path, PRICE_TTL);
}

export async function getTimeSeries(
  currency: string, category: string,
  from?: string, to?: string
): Promise<TimeSeriesData> {
  let path = `/api/timeseries/${currency}/${category}`;
  const params: string[] = [];
  if (from) params.push(`from=${from}`);
  if (to) params.push(`to=${to}`);
  if (params.length) path += '?' + params.join('&');
  return cachedFetch<TimeSeriesData>(path, PRICE_TTL);
}

export async function getOhlcvAssets(currency: string): Promise<{ assets: OhlcvAsset[] }> {
  return cachedFetch(`/api/ohlcv/${currency}`, METADATA_TTL);
}

export async function getCurrencies(): Promise<string[]> {
  return cachedFetch('/api/currencies', METADATA_TTL);
}

export async function getSimStatus(): Promise<{ simDate: string; simYear: number }> {
  return cachedFetch('/api/status', 10_000);
}

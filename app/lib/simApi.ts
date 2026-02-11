/**
 * Direct simulation API calls for full chart data (Data tab + instrument charts).
 * These proxy through our trader server to avoid CORS issues.
 */

// In production (same-origin), use '' for relative URLs. In dev, use localhost.
const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL
  || (typeof window !== 'undefined' && window.location?.hostname !== 'localhost'
    ? ''
    : 'http://localhost:3001');

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
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

// --- API calls ---

/**
 * Get core instrument prices for a currency (ETF, Credit Bank, Machine).
 */
export async function getInstruments(currency: string) {
  return apiFetch(`/api/instruments/${currency}`);
}

/**
 * Get commodity prices for a currency (dynamic — all discovered goods).
 */
export async function getCommodities(currency: string) {
  return apiFetch(`/api/instruments/${currency}/commodities`);
}

/**
 * Get forex prices for a currency.
 */
export async function getForex(currency: string) {
  return apiFetch(`/api/forex/${currency}`);
}

/**
 * Get single instrument price.
 */
export async function getInstrumentPrice(currency: string, id: string) {
  return apiFetch(`/api/instrument/${currency}/${id}`);
}

/**
 * Get full chart data for an instrument.
 */
export async function getInstrumentChart(currency: string, id: string, from?: string, to?: string) {
  let path = `/api/instrument/${currency}/${id}/chart`;
  const params: string[] = [];
  if (from) params.push(`from=${from}`);
  if (to) params.push(`to=${to}`);
  if (params.length) path += '?' + params.join('&');
  return apiFetch(path);
}

/**
 * Get exchange rate between two currencies.
 */
export async function getExchangeRate(from: string, to: string) {
  return apiFetch<{ from: string; to: string; rate: number }>(`/api/exchange-rate/${from}/${to}`);
}

/**
 * Get leaderboard by type.
 */
export async function getLeaderboard(type: string) {
  return apiFetch(`/api/leaderboard/${type}`);
}

/**
 * Get portfolio (requires auth header).
 */
export async function getPortfolio(token: string) {
  const res = await fetch(`${SERVER_URL}/api/portfolio`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Portfolio fetch failed: ${res.status}`);
  return res.json();
}

/**
 * Bootstrap default accounts (requires auth header).
 */
export async function bootstrapAccounts(token: string) {
  const res = await fetch(`${SERVER_URL}/api/bootstrap-accounts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Bootstrap failed: ${res.status}`);
  return res.json();
}

/**
 * Get sim status.
 */
export async function getSimStatus() {
  return apiFetch<{ simDate: string; simYear: number }>('/api/sim/status');
}

// --- Simulation data proxy (for Data tab) ---

export async function getOhlcvAssets(currency: string) {
  return apiFetch(`/api/sim/ohlcv/${currency}`);
}

export async function getOhlcv(currency: string, assetType: string, assetName: string, from?: string, to?: string) {
  let path = `/api/sim/ohlcv/${currency}/${assetType}/${assetName}`;
  const params: string[] = [];
  if (from) params.push(`from=${from}`);
  if (to) params.push(`to=${to}`);
  if (params.length) path += '?' + params.join('&');
  return apiFetch<OhlcvData>(path);
}

export async function getBalanceSheet(currency: string, agentType: string, from?: string, to?: string) {
  let path = `/api/sim/balance-sheets/${currency}/${agentType}`;
  const params: string[] = [];
  if (from) params.push(`from=${from}`);
  if (to) params.push(`to=${to}`);
  if (params.length) path += '?' + params.join('&');
  return apiFetch<BalanceSheetData>(path);
}

export async function getTimeSeries(currency: string, category: string, from?: string, to?: string) {
  let path = `/api/sim/timeseries/${currency}/${category}`;
  const params: string[] = [];
  if (from) params.push(`from=${from}`);
  if (to) params.push(`to=${to}`);
  if (params.length) path += '?' + params.join('&');
  return apiFetch<TimeSeriesData>(path);
}

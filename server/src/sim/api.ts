/**
 * Simulation API proxy with TTL cache.
 *
 * Live mode:  Fetches from the sim's REST API via HTTP.
 * Replay mode: Queries sim_* tables in Supabase, filtered by the
 *              replay engine's current date.
 */
import { config } from '../config/env';
import { supabaseAdmin } from '../db/supabase';
import { getCurrentSimDate, getReplayProgress } from './replay';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.data as T;
  return undefined;
}

function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

async function cachedFetch<T>(path: string, ttlMs: number): Promise<T> {
  const cached = cacheGet<T>(path);
  if (cached !== undefined) return cached;
  const url = `${config.SIM_API_URL}${path}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Sim API ${resp.status}: ${url}`);
  }
  const data = await resp.json() as T;
  cacheSet(path, data, ttlMs);
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
  if (config.REPLAY_MODE) {
    const effectiveTo = to || getCurrentSimDate();
    const key = `replay:ohlcv:${currency}:${assetType}:${assetName}:${from || ''}:${effectiveTo}`;
    const cached = cacheGet<OhlcvData>(key);
    if (cached) return cached;

    let query = supabaseAdmin
      .from('sim_ohlcv_prices')
      .select('sim_date, open_price, high_price, low_price, close_price, volume')
      .eq('currency', currency)
      .eq('asset_type', assetType)
      .eq('asset_name', assetName)
      .lte('sim_date', effectiveTo)
      .order('sim_date', { ascending: true })
      .limit(50000);

    if (from) query = query.gte('sim_date', from);

    const { data, error } = await query;
    if (error) throw new Error(`Replay ohlcv query failed: ${error.message}`);

    const rows = data || [];
    const result: OhlcvData = {
      dates: rows.map(r => r.sim_date),
      open: rows.map(r => r.open_price),
      high: rows.map(r => r.high_price),
      low: rows.map(r => r.low_price),
      close: rows.map(r => r.close_price),
      volume: rows.map(r => r.volume),
    };
    cacheSet(key, result, PRICE_TTL);
    return result;
  }

  // Live mode — HTTP fetch from sim
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
  if (config.REPLAY_MODE) {
    const effectiveTo = to || getCurrentSimDate();
    const key = `replay:bs:${currency}:${agentType}:${from || ''}:${effectiveTo}`;
    const cached = cacheGet<BalanceSheetData>(key);
    if (cached) return cached;

    let query = supabaseAdmin
      .from('sim_balance_sheets')
      .select('sim_date, hard_cash, cash_giro_short, cash_giro_long, bonds, bank_loans, inventory_value, loans_giro_short, loans_giro_long, financial_liabilities, bank_borrowings, equity')
      .eq('currency', currency)
      .eq('agent_type', agentType)
      .lte('sim_date', effectiveTo)
      .order('sim_date', { ascending: true })
      .limit(50000);

    if (from) query = query.gte('sim_date', from);

    const { data, error } = await query;
    if (error) throw new Error(`Replay balance sheet query failed: ${error.message}`);

    const rows = data || [];
    const result: BalanceSheetData = {
      dates: rows.map(r => r.sim_date),
      hardCash: rows.map(r => r.hard_cash),
      cashGiroShort: rows.map(r => r.cash_giro_short),
      cashGiroLong: rows.map(r => r.cash_giro_long),
      bonds: rows.map(r => r.bonds),
      bankLoans: rows.map(r => r.bank_loans),
      inventoryValue: rows.map(r => r.inventory_value),
      loansGiroShort: rows.map(r => r.loans_giro_short),
      loansGiroLong: rows.map(r => r.loans_giro_long),
      financialLiabilities: rows.map(r => r.financial_liabilities),
      bankBorrowings: rows.map(r => r.bank_borrowings),
      equity: rows.map(r => r.equity),
    };
    cacheSet(key, result, PRICE_TTL);
    return result;
  }

  // Live mode
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
  if (config.REPLAY_MODE) {
    // time_series table is not exported in replay mode (too large, not needed for trading).
    // Return empty series so the Data tab degrades gracefully.
    return { series: {} };
  }

  // Live mode
  let path = `/api/timeseries/${currency}/${category}`;
  const params: string[] = [];
  if (from) params.push(`from=${from}`);
  if (to) params.push(`to=${to}`);
  if (params.length) path += '?' + params.join('&');
  return cachedFetch<TimeSeriesData>(path, PRICE_TTL);
}

export async function getOhlcvAssets(currency: string): Promise<{ assets: OhlcvAsset[] }> {
  if (config.REPLAY_MODE) {
    const key = `replay:assets:${currency}`;
    const cached = cacheGet<{ assets: OhlcvAsset[] }>(key);
    if (cached) return cached;

    const { data, error } = await supabaseAdmin
      .from('sim_ohlcv_prices')
      .select('asset_type, asset_name')
      .eq('currency', currency)
      .limit(50000);

    if (error) throw new Error(`Replay assets query failed: ${error.message}`);

    // Deduplicate (Supabase JS doesn't support SELECT DISTINCT)
    const seen = new Set<string>();
    const assets: OhlcvAsset[] = [];
    for (const row of data || []) {
      const k = `${row.asset_type}:${row.asset_name}`;
      if (!seen.has(k)) {
        seen.add(k);
        assets.push({ assetType: row.asset_type, assetName: row.asset_name });
      }
    }

    const result = { assets };
    cacheSet(key, result, METADATA_TTL);
    return result;
  }

  // Live mode
  return cachedFetch(`/api/ohlcv/${currency}`, METADATA_TTL);
}

export async function getCurrencies(): Promise<string[]> {
  if (config.REPLAY_MODE) {
    // Currencies are known — hardcode to avoid querying a non-exported table
    return ['EUR', 'USD', 'YEN'];
  }

  // Live mode
  return cachedFetch('/api/currencies', METADATA_TTL);
}

export interface ConfigChange {
  id: number;
  simDate: string;
  settingKey: string;
  ruleId: string;
  ruleTitle: string;
  oldValue: string;
  newValue: string;
  intensity: string;
  explanation: string;
  changedAt: string;
}

export async function getConfigChanges(
  currency?: string, from?: string, to?: string
): Promise<ConfigChange[]> {
  if (config.REPLAY_MODE) {
    const effectiveTo = to || getCurrentSimDate();
    const key = `replay:config:${currency || 'all'}:${from || ''}:${effectiveTo}`;
    const cached = cacheGet<ConfigChange[]>(key);
    if (cached) return cached;

    let query = supabaseAdmin
      .from('sim_config_changes')
      .select('*')
      .lte('sim_date', effectiveTo)
      .order('sim_date', { ascending: false })
      .limit(500);

    // Filter by currency using setting_key LIKE pattern (e.g., "[Autopilot EUR]%")
    if (currency) query = query.like('setting_key', `%${currency}%`);
    if (from) query = query.gte('sim_date', from);

    const { data, error } = await query;
    if (error) throw new Error(`Replay config changes query failed: ${error.message}`);

    const result: ConfigChange[] = (data || []).map(r => ({
      id: r.id,
      simDate: r.sim_date,
      settingKey: r.setting_key,
      ruleId: r.rule_id,
      ruleTitle: r.rule_title,
      oldValue: r.old_value,
      newValue: r.new_value,
      intensity: r.intensity,
      explanation: r.explanation,
      changedAt: r.changed_at,
    }));
    cacheSet(key, result, PRICE_TTL);
    return result;
  }

  // Live mode — proxy to sim
  let path = '/api/config-changes';
  const params: string[] = [];
  if (currency) params.push(`currency=${currency}`);
  if (from) params.push(`from=${from}`);
  if (to) params.push(`to=${to}`);
  if (params.length) path += '?' + params.join('&');
  return cachedFetch<ConfigChange[]>(path, PRICE_TTL);
}

export async function getSimStatus(): Promise<{ simDate: string; simYear: number; replayMode?: boolean }> {
  if (config.REPLAY_MODE) {
    const simDate = getCurrentSimDate();
    const year = simDate ? parseInt(simDate.substring(0, 4), 10) - 2000 : 0;
    return { simDate, simYear: year, replayMode: true };
  }

  // Live mode
  return cachedFetch('/api/status', 10_000);
}

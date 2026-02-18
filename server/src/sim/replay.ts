/**
 * Replay Engine — stateless cursor that replays pre-computed sim data.
 *
 * The current sim date is a pure function of elapsed time:
 *   dayIndex = floor((now - startedAt - pausedMs) / msPerDay)
 *   currentDate = allDates[dayIndex]
 *
 * A 500ms poll loop detects day changes and fires the onDayChange callback,
 * which triggers price broadcasts + snapshots (same as the SSE handler in live mode).
 */
import { supabaseAdmin } from '../db/supabase';
import { clearCache } from './api';
import { config } from '../config/env';

// ── State ────────────────────────────────────────────────────────

let allDates: string[] = [];
let replayStartedAt = 0;
let totalPausedMs = 0;
let pausedAt: number | null = null;
let broadcastTimer: ReturnType<typeof setInterval> | null = null;
let lastBroadcastDate = '';
let onDayChange: ((simDate: string) => void) | null = null;

// ── Pure cursor ──────────────────────────────────────────────────

function computeDateIndex(): number {
  if (allDates.length === 0) return -1;
  const now = pausedAt ?? Date.now();
  const elapsedMs = now - replayStartedAt - totalPausedMs;
  const idx = Math.floor(elapsedMs / config.REPLAY_SPEED_MS);
  return Math.max(0, Math.min(idx, allDates.length - 1));
}

export function getCurrentSimDate(): string {
  const idx = computeDateIndex();
  return idx >= 0 ? allDates[idx] : '';
}

export function getReplayProgress() {
  const idx = computeDateIndex();
  return {
    status: allDates.length === 0
      ? 'not_initialized'
      : idx >= allDates.length - 1
        ? 'finished'
        : pausedAt !== null
          ? 'paused'
          : 'running',
    currentDate: idx >= 0 ? allDates[idx] : '',
    currentIndex: idx,
    totalDates: allDates.length,
    paused: pausedAt !== null,
    pctComplete: allDates.length > 1 ? (idx / (allDates.length - 1)) * 100 : 0,
    msPerDay: config.REPLAY_SPEED_MS,
  };
}

// ── Lifecycle ────────────────────────────────────────────────────

export async function initReplay(
  dayChangeHandler: (simDate: string) => void
): Promise<void> {
  onDayChange = dayChangeHandler;

  // Load all distinct sim dates by paginating (Supabase default limit is 1000)
  console.log('[Replay] Loading sim dates from Supabase...');
  const allDateSet = new Set<string>();
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseAdmin
      .rpc('get_distinct_sim_dates')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw new Error(`Failed to load replay dates: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) {
      allDateSet.add((r as { sim_date: string }).sim_date);
    }
    if (data.length < pageSize) break;
    page++;
  }

  allDates = Array.from(allDateSet).sort();

  if (allDates.length === 0) {
    throw new Error('No sim data found in sim_ohlcv_prices. Run the export script first.');
  }

  console.log(`[Replay] Loaded ${allDates.length} sim dates (${allDates[0]} → ${allDates[allDates.length - 1]})`);

  // Initialize cursor
  replayStartedAt = Date.now();
  totalPausedMs = 0;
  pausedAt = null;
  lastBroadcastDate = '';

  // Broadcast loop — thin detector, not source of truth
  broadcastTimer = setInterval(() => {
    const currentDate = getCurrentSimDate();
    if (currentDate && currentDate !== lastBroadcastDate) {
      lastBroadcastDate = currentDate;
      clearCache();
      if (onDayChange) onDayChange(currentDate);
    }
  }, 500);

  console.log(`[Replay] Started — ${config.REPLAY_SPEED_MS}ms per sim-day`);
}

// ── Admin controls ───────────────────────────────────────────────

export function pauseReplay(): void {
  if (pausedAt !== null) return;
  pausedAt = Date.now();
  console.log(`[Replay] Paused at ${getCurrentSimDate()}`);
}

export function resumeReplay(): void {
  if (pausedAt === null) return;
  totalPausedMs += Date.now() - pausedAt;
  pausedAt = null;
  console.log(`[Replay] Resumed at ${getCurrentSimDate()}`);
}

export function setReplaySpeed(msPerDay: number): void {
  // Preserve current position when changing speed:
  // Record current index, update speed, recompute startedAt
  const currentIdx = computeDateIndex();
  config.REPLAY_SPEED_MS = Math.max(100, msPerDay);
  const now = pausedAt ?? Date.now();
  replayStartedAt = now - totalPausedMs - (currentIdx * config.REPLAY_SPEED_MS);
  lastBroadcastDate = ''; // force re-broadcast
  clearCache();
  console.log(`[Replay] Speed set to ${config.REPLAY_SPEED_MS}ms/day`);
}

export function seekToDate(targetDate: string): void {
  const targetIndex = allDates.indexOf(targetDate);
  if (targetIndex < 0) {
    console.warn(`[Replay] Seek target ${targetDate} not found`);
    return;
  }
  seekToIndex(targetIndex);
}

export function seekToIndex(targetIndex: number): void {
  if (targetIndex < 0 || targetIndex >= allDates.length) return;
  const now = pausedAt ?? Date.now();
  replayStartedAt = now - totalPausedMs - (targetIndex * config.REPLAY_SPEED_MS);
  if (pausedAt !== null) {
    pausedAt = now;
  }
  lastBroadcastDate = '';
  clearCache();
  console.log(`[Replay] Seeked to ${allDates[targetIndex]} (index ${targetIndex})`);
}

export function stopReplay(): void {
  if (broadcastTimer) {
    clearInterval(broadcastTimer);
    broadcastTimer = null;
  }
  allDates = [];
  console.log('[Replay] Stopped');
}

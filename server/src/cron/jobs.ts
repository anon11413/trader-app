/**
 * Cron jobs — periodic tasks for price snapshots, leaderboard refresh, cleanup.
 */
import cron from 'node-cron';
import { supabaseAdmin } from '../db/supabase';
import { getAllPrices, CURRENCIES, Currency } from '../sim/instruments';
import { refreshTotalValueLeaderboard, refreshCashLeaderboard } from '../game/leaderboard';

/**
 * Snapshot all 21 instrument prices (7 instruments x 3 currencies).
 * Runs every 60 seconds.
 */
async function snapshotPrices(): Promise<void> {
  try {
    const rows: { instrument_id: string; currency: string; price: number }[] = [];

    for (const currency of CURRENCIES) {
      const prices = await getAllPrices(currency);
      for (const p of prices) {
        rows.push({
          instrument_id: p.id,
          currency: p.currency,
          price: p.price,
        });
      }
    }

    if (rows.length > 0) {
      await supabaseAdmin.from('price_snapshots').insert(rows);
    }
    console.log(`[Cron] Snapshotted ${rows.length} prices`);
  } catch (e) {
    console.error('[Cron] Price snapshot failed:', e);
  }
}

/**
 * Refresh all leaderboards. Runs every 30 seconds.
 */
async function refreshLeaderboards(): Promise<void> {
  try {
    await Promise.all([
      refreshTotalValueLeaderboard(),
      refreshCashLeaderboard(),
    ]);
    console.log('[Cron] Leaderboards refreshed');
  } catch (e) {
    console.error('[Cron] Leaderboard refresh failed:', e);
  }
}

/**
 * Cleanup old price snapshots (> 7 days). Runs daily at midnight.
 */
async function cleanupOldSnapshots(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabaseAdmin
      .from('price_snapshots')
      .delete()
      .lt('recorded_at', cutoff);

    if (error) {
      console.error('[Cron] Cleanup error:', error.message);
    } else {
      console.log('[Cron] Cleaned up old price snapshots');
    }
  } catch (e) {
    console.error('[Cron] Cleanup failed:', e);
  }
}

/**
 * Start all cron jobs.
 * In replay mode, skip the price snapshot cron (replay engine handles it per day-advance).
 */
export function startCronJobs(opts?: { skipPriceSnapshot?: boolean }) {
  if (!opts?.skipPriceSnapshot) {
    // Every 60 seconds: snapshot prices
    cron.schedule('*/60 * * * * *', snapshotPrices);
  }

  // Every 30 seconds: refresh leaderboards
  cron.schedule('*/30 * * * * *', refreshLeaderboards);

  // Daily at midnight: cleanup old snapshots
  cron.schedule('0 0 * * *', cleanupOldSnapshots);

  console.log('[Cron] Cron jobs started' + (opts?.skipPriceSnapshot ? ' (price snapshot disabled — replay mode)' : ''));
}

// Export for manual triggering (e.g., on SSE sim update)
export { snapshotPrices, refreshLeaderboards };

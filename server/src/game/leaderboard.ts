/**
 * Leaderboard computation — updates the leaderboard_cache table
 * with current rankings based on portfolio valuations.
 */
import { supabaseAdmin } from '../db/supabase';
import { getInstrumentPrice, Currency } from '../sim/instruments';

export type LeaderboardType = 'total_value' | 'total_cash' | 'realized_pct' | 'unrealized_pct';

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  value: number;
}

/**
 * Refresh the total_value leaderboard by computing portfolio valuations.
 */
export async function refreshTotalValueLeaderboard(): Promise<void> {
  try {
    // Get all players with their accounts and holdings
    const { data: players } = await supabaseAdmin
      .from('players')
      .select('id, username');

    if (!players || players.length === 0) return;

    const entries: { player_id: string; username: string; value: number }[] = [];

    for (const player of players) {
      const { data: accounts } = await supabaseAdmin
        .from('player_accounts')
        .select('currency, cash_balance, holdings(instrument_id, quantity)')
        .eq('player_id', player.id);

      let totalValue = 0;
      for (const acct of (accounts || [])) {
        totalValue += acct.cash_balance;
        for (const h of (acct.holdings || [])) {
          const priceData = await getInstrumentPrice(
            h.instrument_id, acct.currency as Currency
          );
          if (priceData) {
            totalValue += h.quantity * priceData.price;
          }
        }
      }

      entries.push({ player_id: player.id, username: player.username, value: totalValue });
    }

    // Sort by value descending
    entries.sort((a, b) => b.value - a.value);

    // Write to cache (top 100)
    const top100 = entries.slice(0, 100).map((e, i) => ({
      leaderboard_type: 'total_value' as const,
      player_id: e.player_id,
      username: e.username,
      rank: i + 1,
      value: e.value,
      updated_at: new Date().toISOString(),
    }));

    if (top100.length > 0) {
      // Delete existing and insert fresh
      await supabaseAdmin
        .from('leaderboard_cache')
        .delete()
        .eq('leaderboard_type', 'total_value');

      await supabaseAdmin
        .from('leaderboard_cache')
        .insert(top100);
    }
  } catch (e) {
    console.error('[Leaderboard] Failed to refresh total_value:', e);
  }
}

/**
 * Refresh cash-only leaderboard (uses materialized view).
 */
export async function refreshCashLeaderboard(): Promise<void> {
  try {
    await supabaseAdmin.rpc('refresh_leaderboards');
  } catch (e) {
    console.error('[Leaderboard] Failed to refresh cash view:', e);
  }
}

/**
 * Get leaderboard entries.
 */
export async function getLeaderboard(type: LeaderboardType): Promise<LeaderboardEntry[]> {
  if (type === 'total_cash') {
    const { data } = await supabaseAdmin
      .from('leaderboard_by_total_cash')
      .select('*')
      .order('rank')
      .limit(100);

    return (data || []).map(row => ({
      rank: row.rank,
      playerId: row.player_id,
      username: row.username,
      value: row.total_cash,
    }));
  }

  // Other types come from leaderboard_cache
  const { data } = await supabaseAdmin
    .from('leaderboard_cache')
    .select('*')
    .eq('leaderboard_type', type)
    .order('rank')
    .limit(100);

  return (data || []).map(row => ({
    rank: row.rank,
    playerId: row.player_id,
    username: row.username,
    value: row.value,
  }));
}

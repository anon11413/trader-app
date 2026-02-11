/**
 * Leaderboard tab — rankings by total value, cash, realized %, unrealized %.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, SegmentedButtons } from 'react-native-paper';
import LeaderboardRow from '../../components/LeaderboardRow';
import { colors, spacing, fontSize } from '../../theme';
import { useStore, LeaderboardEntry } from '../../lib/store';
import * as simApi from '../../lib/simApi';

type LeaderboardType = 'total_value' | 'total_cash';

export default function LeaderboardScreen() {
  const { leaderboard, leaderboardType, setLeaderboard } = useStore();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [type, setType] = useState<LeaderboardType>('total_value');

  const fetchLeaderboard = useCallback(async (t: string) => {
    try {
      setLoading(true);
      const data = await simApi.getLeaderboard(t) as LeaderboardEntry[];
      setLeaderboard(data, t);
    } catch (e) {
      console.error('[Leaderboard] Failed to fetch:', e);
    } finally {
      setLoading(false);
    }
  }, [setLeaderboard]);

  useEffect(() => {
    fetchLeaderboard(type);
  }, [type, fetchLeaderboard]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => fetchLeaderboard(type), 30000);
    return () => clearInterval(interval);
  }, [type, fetchLeaderboard]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLeaderboard(type);
    setRefreshing(false);
  }, [type, fetchLeaderboard]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Leaderboard</Text>
      </View>

      {/* Type selector */}
      <View style={styles.selectorRow}>
        <SegmentedButtons
          value={type}
          onValueChange={(v) => setType(v as LeaderboardType)}
          buttons={[
            { value: 'total_value', label: 'Total Value' },
            { value: 'total_cash', label: 'Cash' },
          ]}
          style={styles.segmented}
          theme={{
            colors: {
              secondaryContainer: colors.primaryDim,
              onSecondaryContainer: '#fff',
              onSurface: colors.textDim,
            },
          }}
        />
      </View>

      {/* Column headers */}
      <View style={styles.columnHeaders}>
        <Text style={[styles.colHeader, { width: 40, textAlign: 'center' }]}>Rank</Text>
        <Text style={[styles.colHeader, { flex: 1, paddingLeft: spacing.sm }]}>Player</Text>
        <Text style={[styles.colHeader, { minWidth: 80, textAlign: 'right' }]}>Value</Text>
      </View>

      {/* Leaderboard list */}
      <ScrollView
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {leaderboard.map((entry) => (
          <LeaderboardRow
            key={entry.playerId}
            rank={entry.rank}
            username={entry.username}
            playerId={entry.playerId}
            value={entry.value}
          />
        ))}

        {leaderboard.length === 0 && !loading && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No players ranked yet</Text>
            <Text style={styles.emptyHint}>Start trading to appear on the leaderboard!</Text>
          </View>
        )}

        {loading && leaderboard.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Loading rankings...</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl + spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  selectorRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  segmented: {
    backgroundColor: colors.surface,
  },
  columnHeaders: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  colHeader: {
    fontSize: fontSize.xs,
    color: colors.textDim,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  list: {
    flex: 1,
  },
  emptyState: {
    padding: spacing.xl * 2,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textDim,
    fontSize: fontSize.lg,
  },
  emptyHint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
  },
});

/**
 * LeaderboardRow — single row in the leaderboard with rank, name, value.
 * Gold/silver/bronze styling for top 3.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, spacing, fontSize } from '../theme';
import { formatCurrency } from '../lib/format';
import { useStore } from '../lib/store';

interface LeaderboardRowProps {
  rank: number;
  username: string;
  playerId: string;
  value: number;
}

export default function LeaderboardRow({ rank, username, playerId, value }: LeaderboardRowProps) {
  const { userId } = useStore();
  const isCurrentUser = playerId === userId;

  const medalColors: Record<number, string> = {
    1: colors.gold,
    2: colors.silver,
    3: colors.bronze,
  };

  const medalColor = medalColors[rank];
  const medalEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;

  return (
    <View style={[
      styles.row,
      isCurrentUser && styles.rowHighlight,
      rank <= 3 && styles.rowMedal,
    ]}>
      {/* Rank */}
      <View style={styles.rankContainer}>
        {medalEmoji ? (
          <Text style={styles.medal}>{medalEmoji}</Text>
        ) : (
          <Text style={styles.rank}>#{rank}</Text>
        )}
      </View>

      {/* Username */}
      <View style={styles.nameContainer}>
        <Text style={[
          styles.username,
          isCurrentUser && styles.usernameHighlight,
          medalColor ? { color: medalColor } : undefined,
        ]} numberOfLines={1}>
          {username}
        </Text>
        {isCurrentUser && (
          <Text style={styles.youBadge}>You</Text>
        )}
      </View>

      {/* Value */}
      <Text style={[
        styles.value,
        medalColor ? { color: medalColor } : undefined,
      ]}>
        {formatCurrency(value, 'EUR')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowHighlight: {
    backgroundColor: colors.primary + '10',
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  rowMedal: {
    backgroundColor: colors.surfaceLight,
  },
  rankContainer: {
    width: 40,
    alignItems: 'center',
  },
  medal: {
    fontSize: 20,
  },
  rank: {
    fontSize: fontSize.md,
    color: colors.textDim,
    fontWeight: '600',
  },
  nameContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  username: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '600',
  },
  usernameHighlight: {
    color: colors.primary,
  },
  youBadge: {
    fontSize: fontSize.xs,
    color: colors.primary,
    backgroundColor: colors.primary + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: spacing.sm,
    fontWeight: '700',
    overflow: 'hidden',
  },
  value: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '700',
    minWidth: 80,
    textAlign: 'right',
  },
});

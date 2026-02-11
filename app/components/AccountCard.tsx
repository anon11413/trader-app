/**
 * AccountCard — displays a currency account with balance, holdings, and P/L.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, spacing, fontSize, currencyColor } from '../theme';
import { formatCurrency, formatChange, getCurrencySymbol } from '../lib/format';
import { getInstrumentDisplayName } from '../lib/instruments';
import type { Account } from '../lib/store';

interface AccountCardProps {
  account: Account;
}

export default function AccountCard({ account }: AccountCardProps) {
  const accentColor = currencyColor(account.currency);
  const hasHoldings = account.holdings.length > 0;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.dot, { backgroundColor: accentColor }]} />
          <Text style={[styles.currency, { color: accentColor }]}>
            {account.currency}
          </Text>
        </View>
        <Text style={styles.totalValue}>
          {formatCurrency(account.totalValue, account.currency)}
        </Text>
      </View>

      {/* Cash balance */}
      <View style={styles.row}>
        <Text style={styles.label}>Cash Balance</Text>
        <Text style={styles.value}>
          {formatCurrency(account.cashBalance, account.currency)}
        </Text>
      </View>

      {/* Holdings */}
      {hasHoldings && (
        <View style={styles.holdingsSection}>
          <Text style={styles.holdingsTitle}>Holdings</Text>
          {account.holdings.map((h) => {
            const isPositive = h.unrealizedPL >= 0;
            return (
              <View key={h.instrumentId} style={styles.holdingRow}>
                <View style={styles.holdingLeft}>
                  <Text style={styles.holdingName}>
                    {getInstrumentDisplayName(h.instrumentId, account.currency)}
                  </Text>
                  <Text style={styles.holdingQty}>
                    {h.quantity} units @ {getCurrencySymbol(account.currency)}{h.avgCostBasis.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.holdingRight}>
                  <Text style={styles.holdingValue}>
                    {formatCurrency(h.currentValue, account.currency)}
                  </Text>
                  <Text style={[
                    styles.holdingPL,
                    { color: isPositive ? colors.success : colors.error }
                  ]}>
                    {isPositive ? '+' : ''}{formatCurrency(h.unrealizedPL, account.currency)} ({formatChange(h.unrealizedPLPercent)})
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {!hasHoldings && (
        <Text style={styles.noHoldings}>No holdings yet</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  currency: {
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  totalValue: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  label: {
    color: colors.textDim,
    fontSize: fontSize.md,
  },
  value: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  holdingsSection: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  holdingsTitle: {
    fontSize: fontSize.sm,
    color: colors.textDim,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  holdingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  holdingLeft: {
    flex: 1,
  },
  holdingName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  holdingQty: {
    color: colors.textDim,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  holdingRight: {
    alignItems: 'flex-end',
  },
  holdingValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  holdingPL: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  noHoldings: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
});

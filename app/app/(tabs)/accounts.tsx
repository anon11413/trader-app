/**
 * Accounts tab — manage currency accounts, view holdings, convert currency.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, Button, FAB } from 'react-native-paper';
import AccountCard from '../../components/AccountCard';
import CurrencyConvertModal from '../../components/CurrencyConvertModal';
import { colors, spacing, fontSize, currencyColor } from '../../theme';
import { formatCurrency } from '../../lib/format';
import { useStore } from '../../lib/store';
import { gameSocket } from '../../lib/socket';
import { CURRENCIES } from '../../lib/instruments';
import * as simApi from '../../lib/simApi';
import { getAccessToken } from '../../lib/supabase';

export default function AccountsScreen() {
  const { portfolio, setPortfolio } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState<string | null>(null);

  const fetchPortfolio = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (token) {
        const data = await simApi.getPortfolio(token);
        setPortfolio(data);
      }
    } catch (e) {
      console.error('[Accounts] Failed to fetch portfolio:', e);
    }
  }, [setPortfolio]);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  // Refresh on trade/convert events
  useEffect(() => {
    const unsubs = [
      gameSocket.on('trade_success', () => fetchPortfolio()),
      gameSocket.on('convert_success', () => fetchPortfolio()),
      gameSocket.on('account_created', () => fetchPortfolio()),
    ];
    return () => unsubs.forEach(u => u());
  }, [fetchPortfolio]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPortfolio();
    setRefreshing(false);
  }, [fetchPortfolio]);

  const accounts = portfolio?.accounts || [];
  const existingCurrencies = accounts.map(a => a.currency);
  const missingCurrencies = CURRENCIES.filter(c => !existingCurrencies.includes(c));

  async function createAccount(currency: string) {
    setCreatingAccount(currency);
    try {
      gameSocket.send('create_account', { currency });
      // Listen for result
      const unsub = gameSocket.on('account_created', () => {
        setCreatingAccount(null);
        unsub();
      });
      const unsubErr = gameSocket.on('account_error', () => {
        setCreatingAccount(null);
        unsubErr();
      });
    } catch {
      setCreatingAccount(null);
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Accounts</Text>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Total portfolio value */}
        {portfolio && (
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total Portfolio Value</Text>
            <Text style={styles.totalValue}>
              {formatCurrency(portfolio.totalValueEUR, 'EUR')}
            </Text>
            <Text style={styles.totalNote}>Combined across all currencies</Text>
          </View>
        )}

        {/* Existing accounts */}
        {accounts.map((account) => (
          <AccountCard key={account.id} account={account} />
        ))}

        {/* Create missing accounts */}
        {missingCurrencies.length > 0 && (
          <View style={styles.createSection}>
            <Text style={styles.createTitle}>Open New Account</Text>
            <Text style={styles.createSubtitle}>
              Create accounts in other currencies to trade their instruments.
              Convert funds at live exchange rates.
            </Text>
            {missingCurrencies.map((cur) => (
              <Button
                key={cur}
                mode="outlined"
                onPress={() => createAccount(cur)}
                loading={creatingAccount === cur}
                disabled={creatingAccount !== null}
                style={styles.createButton}
                textColor={currencyColor(cur)}
                icon="plus"
              >
                Create {cur} Account
              </Button>
            ))}
          </View>
        )}

        {accounts.length === 0 && !portfolio && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Loading accounts...</Text>
          </View>
        )}
      </ScrollView>

      {/* Convert FAB */}
      {accounts.length >= 2 && (
        <FAB
          icon="swap-horizontal"
          label="Convert"
          onPress={() => setShowConvert(true)}
          style={styles.fab}
          color="#000"
          customSize={48}
        />
      )}

      {/* Convert modal */}
      <CurrencyConvertModal
        visible={showConvert}
        onDismiss={() => setShowConvert(false)}
      />
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
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 100,
  },
  totalCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary + '40',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: fontSize.sm,
    color: colors.textDim,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  totalValue: {
    fontSize: fontSize.hero,
    fontWeight: '700',
    color: colors.primary,
    marginTop: spacing.xs,
  },
  totalNote: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  createSection: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  createTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  createSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textDim,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  createButton: {
    marginBottom: spacing.sm,
    borderColor: colors.border,
  },
  emptyState: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textDim,
    fontSize: fontSize.lg,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    backgroundColor: colors.primary,
  },
});

/**
 * Dashboard (home tab) — portfolio summary, recent trades, market overview.
 */
import React, { useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import MiniChart from '../../components/MiniChart';
import { colors, spacing, fontSize, currencyColor } from '../../theme';
import { formatCurrency, formatPrice, formatChange, formatTimeAgo } from '../../lib/format';
import { useStore, InstrumentPrice } from '../../lib/store';
import { gameSocket } from '../../lib/socket';
import { getSupabaseClient, getAccessToken } from '../../lib/supabase';
import * as simApi from '../../lib/simApi';
import { CURRENCIES } from '../../lib/instruments';

export default function DashboardScreen() {
  const router = useRouter();
  const {
    username, portfolio, prices, tradeFeed, simDate,
    setPortfolio, setPrices, addTradeFeedItem, setSimDate, clearAuth,
  } = useStore();
  const [refreshing, setRefreshing] = React.useState(false);

  // Fetch portfolio + prices
  const fetchAll = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (token) {
        const data = await simApi.getPortfolio(token);
        setPortfolio(data);
      }
      // Fetch prices for all currencies
      await Promise.all(
        CURRENCIES.map(async (cur) => {
          const data = await simApi.getInstruments(cur) as InstrumentPrice[];
          setPrices(cur, data);
        })
      );
      // Sim status
      const status = await simApi.getSimStatus();
      if (status.simDate) setSimDate(status.simDate);
    } catch (e) {
      console.error('[Dashboard] Fetch error:', e);
    }
  }, [setPortfolio, setPrices, setSimDate]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Listen for live events
  useEffect(() => {
    const unsubs = [
      gameSocket.on('price_update', (data: any) => {
        if (data.currency && data.instruments) setPrices(data.currency, data.instruments);
        if (data.simDate) setSimDate(data.simDate);
      }),
      gameSocket.on('trade_feed', (item: any) => addTradeFeedItem(item)),
      gameSocket.on('trade_success', () => fetchAll()),
    ];
    return () => unsubs.forEach(u => u());
  }, [setPrices, setSimDate, addTradeFeedItem, fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  const accounts = portfolio?.accounts || [];

  // Top holdings across all accounts
  const topHoldings = accounts.flatMap(a =>
    a.holdings.map(h => ({ ...h, currency: a.currency }))
  ).sort((a, b) => b.currentValue - a.currentValue).slice(0, 5);

  // Broad Market ETF sparklines (one per currency)
  const broadMarketCharts = CURRENCIES.map(cur => {
    const curPrices = prices[cur] || [];
    return curPrices.find(p => p.id === 'BROAD_MARKET_ETF');
  }).filter(Boolean) as InstrumentPrice[];

  async function handleLogout() {
    const sb = await getSupabaseClient();
    await sb.auth.signOut();
    clearAuth();
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.username}>{username || 'Trader'}</Text>
          </View>
          <Button
            mode="text"
            onPress={handleLogout}
            textColor={colors.textDim}
            compact
          >
            Logout
          </Button>
        </View>

        {/* Sim date */}
        {simDate && (
          <Text style={styles.simDate}>Simulation: {simDate}</Text>
        )}

        {/* Portfolio total */}
        {portfolio && (
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Portfolio Value</Text>
            <Text style={styles.totalValue}>
              {formatCurrency(portfolio.totalValueEUR, 'EUR')}
            </Text>
            {/* Account chips */}
            <View style={styles.accountChips}>
              {accounts.map(a => (
                <View key={a.id} style={[styles.chip, { borderColor: currencyColor(a.currency) + '60' }]}>
                  <Text style={[styles.chipText, { color: currencyColor(a.currency) }]}>
                    {a.currency}: {formatCurrency(a.totalValue, a.currency)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Broad Market ETF overview */}
        {broadMarketCharts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Market Overview</Text>
            <View style={styles.marketRow}>
              {broadMarketCharts.map((etf) => {
                const isPositive = etf.changePercent >= 0;
                return (
                  <Pressable
                    key={etf.currency}
                    style={styles.marketCard}
                    onPress={() => router.push(`/instrument/${etf.id}?currency=${etf.currency}`)}
                  >
                    <Text style={[styles.marketCurrency, { color: currencyColor(etf.currency) }]}>
                      {etf.currency}
                    </Text>
                    <MiniChart data={etf.sparkline} width={70} height={24} positive={isPositive} />
                    <Text style={[styles.marketChange, { color: isPositive ? colors.success : colors.error }]}>
                      {formatChange(etf.changePercent)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Top holdings */}
        {topHoldings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Holdings</Text>
            {topHoldings.map((h, i) => {
              const isPositive = h.unrealizedPL >= 0;
              return (
                <View key={`${h.instrumentId}-${h.currency}`} style={styles.holdingRow}>
                  <View style={styles.holdingLeft}>
                    <Text style={styles.holdingName}>{h.instrumentId}</Text>
                    <Text style={styles.holdingQty}>{h.quantity} units</Text>
                  </View>
                  <View style={styles.holdingRight}>
                    <Text style={styles.holdingValue}>
                      {formatCurrency(h.currentValue, h.currency)}
                    </Text>
                    <Text style={[styles.holdingPL, { color: isPositive ? colors.success : colors.error }]}>
                      {isPositive ? '+' : ''}{formatCurrency(h.unrealizedPL, h.currency)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Recent trade feed */}
        {tradeFeed.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Trades (All Players)</Text>
            {tradeFeed.slice(0, 5).map((t, i) => (
              <View key={i} style={styles.tradeRow}>
                <Text style={styles.tradeInfo}>
                  <Text style={{ color: t.tradeType === 'buy' ? colors.success : colors.error }}>
                    {t.tradeType.toUpperCase()}
                  </Text>
                  {' '}{t.quantity}x {t.instrument}
                </Text>
                <Text style={styles.tradeTime}>{formatTimeAgo(t.timestamp)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Quick links */}
        <View style={styles.quickLinks}>
          <Button
            mode="outlined"
            onPress={() => router.push('/(tabs)/markets')}
            style={styles.quickLink}
            textColor={colors.primary}
          >
            View Markets
          </Button>
          <Button
            mode="outlined"
            onPress={() => router.push('/(tabs)/leaderboard')}
            style={styles.quickLink}
            textColor={colors.primary}
          >
            Leaderboard
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xl + spacing.md,
    paddingBottom: spacing.xl * 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  greeting: {
    fontSize: fontSize.md,
    color: colors.textDim,
  },
  username: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  simDate: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.md,
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
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  totalValue: {
    fontSize: fontSize.hero,
    fontWeight: '700',
    color: colors.primary,
    marginVertical: spacing.xs,
  },
  accountChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: colors.surfaceLight,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    color: colors.textDim,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  marketRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  marketCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  marketCurrency: {
    fontSize: fontSize.md,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  marketChange: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  holdingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  holdingLeft: {},
  holdingName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
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
  tradeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tradeInfo: {
    color: colors.text,
    fontSize: fontSize.md,
  },
  tradeTime: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  quickLinks: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  quickLink: {
    flex: 1,
    borderColor: colors.border,
  },
});

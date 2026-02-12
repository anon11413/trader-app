/**
 * Forex tab — shows exchange rates between currencies with sparklines.
 * Tap a pair to view chart and trade (convert currency).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, SegmentedButtons } from 'react-native-paper';
import InstrumentCard from '../../components/InstrumentCard';
import { colors, spacing, fontSize } from '../../theme';
import { useStore, InstrumentPrice } from '../../lib/store';
import { gameSocket } from '../../lib/socket';
import { CURRENCIES } from '../../lib/instruments';
import type { Currency } from '../../lib/instruments';
import * as simApi from '../../lib/simApi';

export default function ForexScreen() {
  const { forexPrices, setForexPrices, simDate } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState<Currency>('EUR');

  // Fetch forex prices
  const fetchForex = useCallback(async () => {
    try {
      await Promise.all(
        CURRENCIES.map(async (cur) => {
          const data = await simApi.getForex(cur) as InstrumentPrice[];
          setForexPrices(cur, data);
        })
      );
    } catch (e) {
      console.error('[Forex] Failed to fetch:', e);
    }
  }, [setForexPrices]);

  useEffect(() => {
    fetchForex();
  }, [fetchForex]);

  // Listen for live price updates
  useEffect(() => {
    const unsub = gameSocket.on('price_update', (data: any) => {
      if (data.currency && data.forex) {
        setForexPrices(data.currency, data.forex);
      }
    });
    return unsub;
  }, [setForexPrices]);

  // Auto-refresh polling fallback
  useEffect(() => {
    const interval = setInterval(fetchForex, 2000);
    return () => clearInterval(interval);
  }, [fetchForex]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchForex();
    setRefreshing(false);
  }, [fetchForex]);

  const pairs = forexPrices[baseCurrency] || [];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Forex</Text>
        {simDate && <Text style={styles.simDate}>Sim: {simDate}</Text>}
      </View>

      {/* Base currency selector */}
      <View style={styles.filterRow}>
        <SegmentedButtons
          value={baseCurrency}
          onValueChange={(v) => setBaseCurrency(v as Currency)}
          buttons={[
            { value: 'EUR', label: 'EUR Base' },
            { value: 'USD', label: 'USD Base' },
            { value: 'YEN', label: 'YEN Base' },
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

      {/* Forex pairs */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <Text style={styles.sectionTitle}>Exchange Rates</Text>
        {pairs.map((pair) => (
          <InstrumentCard key={pair.id} instrument={pair} />
        ))}

        {pairs.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Loading forex rates...</Text>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl + spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  simDate: {
    fontSize: fontSize.sm,
    color: colors.textDim,
  },
  filterRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  segmented: {
    backgroundColor: colors.surface,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    color: colors.textDim,
    fontWeight: '600',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  emptyState: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textDim,
    fontSize: fontSize.lg,
  },
});

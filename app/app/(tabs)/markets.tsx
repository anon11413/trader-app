/**
 * Markets tab — shows all instruments organized by currency (EUR/USD/YEN),
 * each currency section showing its instruments grouped by section.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, SegmentedButtons } from 'react-native-paper';
import InstrumentCard from '../../components/InstrumentCard';
import { colors, spacing, fontSize, currencyColor } from '../../theme';
import { useStore, InstrumentPrice } from '../../lib/store';
import { gameSocket } from '../../lib/socket';
import { CURRENCIES, SECTION_TITLES, getInstrumentsBySection } from '../../lib/instruments';
import type { Currency } from '../../lib/instruments';
import * as simApi from '../../lib/simApi';

export default function MarketsScreen() {
  const { prices, setPrices, simDate } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | Currency>('all');

  // Fetch prices for all currencies
  const fetchPrices = useCallback(async () => {
    try {
      await Promise.all(
        CURRENCIES.map(async (cur) => {
          const data = await simApi.getInstruments(cur) as InstrumentPrice[];
          setPrices(cur, data);
        })
      );
    } catch (e) {
      console.error('[Markets] Failed to fetch prices:', e);
    }
  }, [setPrices]);

  // Initial fetch
  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  // Listen for live price updates
  useEffect(() => {
    const unsub = gameSocket.on('price_update', (data: any) => {
      if (data.currency && data.instruments) {
        setPrices(data.currency, data.instruments);
      }
    });
    return unsub;
  }, [setPrices]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPrices();
    setRefreshing(false);
  }, [fetchPrices]);

  // Filter currencies to display
  const currenciesToShow = viewMode === 'all' ? [...CURRENCIES] : [viewMode];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Markets</Text>
        {simDate && <Text style={styles.simDate}>Sim: {simDate}</Text>}
      </View>

      {/* Currency filter */}
      <View style={styles.filterRow}>
        <SegmentedButtons
          value={viewMode}
          onValueChange={(v) => setViewMode(v as any)}
          buttons={[
            { value: 'all', label: 'All' },
            { value: 'EUR', label: 'EUR' },
            { value: 'USD', label: 'USD' },
            { value: 'YEN', label: 'YEN' },
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

      {/* Instrument list */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {currenciesToShow.map((currency) => {
          const instruments = prices[currency] || [];
          if (instruments.length === 0) return null;

          // Group by section
          const sectionDefs = getInstrumentsBySection(currency as Currency);
          const sectionOrder = ['market_prices', 'sector_equity', 'etfs_index'];

          return (
            <View key={currency} style={styles.currencyBlock}>
              {/* Currency header */}
              <View style={styles.currencyHeader}>
                <View style={[styles.currencyDot, { backgroundColor: currencyColor(currency) }]} />
                <Text style={[styles.currencyTitle, { color: currencyColor(currency) }]}>
                  {currency} Economy
                </Text>
              </View>

              {sectionOrder.map((sectionKey) => {
                const sectionInstruments = (sectionDefs[sectionKey] || [])
                  .map((def) => instruments.find((i) => i.id === def.id))
                  .filter(Boolean) as InstrumentPrice[];

                if (sectionInstruments.length === 0) return null;

                return (
                  <View key={sectionKey} style={styles.section}>
                    <Text style={styles.sectionTitle}>
                      {SECTION_TITLES[sectionKey] || sectionKey}
                    </Text>
                    {sectionInstruments.map((inst) => (
                      <InstrumentCard key={inst.id} instrument={inst} />
                    ))}
                  </View>
                );
              })}
            </View>
          );
        })}

        {Object.keys(prices).length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Loading market data...</Text>
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
  currencyBlock: {
    marginBottom: spacing.lg,
  },
  currencyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  currencyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  currencyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    color: colors.textDim,
    fontWeight: '600',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
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

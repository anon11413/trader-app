/**
 * Markets tab — shows core instruments + commodities organized by section.
 * Sections: ETFs & Index, Credit & Banking, Market Prices, Commodities.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, SegmentedButtons } from 'react-native-paper';
import InstrumentCard from '../../components/InstrumentCard';
import { colors, spacing, fontSize, currencyColor } from '../../theme';
import { useStore, InstrumentPrice } from '../../lib/store';
import { gameSocket } from '../../lib/socket';
import { CURRENCIES, SECTION_TITLES, SECTION_ORDER, getInstrumentsBySection } from '../../lib/instruments';
import type { Currency } from '../../lib/instruments';
import * as simApi from '../../lib/simApi';

export default function MarketsScreen() {
  const { prices, commodityPrices, setPrices, setCommodityPrices, simDate } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | Currency>('all');

  // Fetch prices for all currencies (core + commodities)
  const fetchPrices = useCallback(async () => {
    try {
      await Promise.all(
        CURRENCIES.map(async (cur) => {
          const [core, commodities] = await Promise.all([
            simApi.getInstruments(cur) as Promise<InstrumentPrice[]>,
            simApi.getCommodities(cur) as Promise<InstrumentPrice[]>,
          ]);
          setPrices(cur, core);
          setCommodityPrices(cur, commodities);
        })
      );
    } catch (e) {
      console.error('[Markets] Failed to fetch prices:', e);
    }
  }, [setPrices, setCommodityPrices]);

  // Initial fetch
  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  // Listen for live price updates
  useEffect(() => {
    const unsub = gameSocket.on('price_update', (data: any) => {
      if (data.currency) {
        if (data.instruments) setPrices(data.currency, data.instruments);
        if (data.commodities) setCommodityPrices(data.currency, data.commodities);
      }
    });
    return unsub;
  }, [setPrices, setCommodityPrices]);

  // Auto-refresh polling fallback
  useEffect(() => {
    const interval = setInterval(fetchPrices, 5000);
    return () => clearInterval(interval);
  }, [fetchPrices]);

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
          const commodities = commodityPrices[currency] || [];
          if (instruments.length === 0 && commodities.length === 0) return null;

          // Group core instruments by section
          const sectionDefs = getInstrumentsBySection(currency as Currency);

          return (
            <View key={currency} style={styles.currencyBlock}>
              {/* Currency header */}
              <View style={styles.currencyHeader}>
                <View style={[styles.currencyDot, { backgroundColor: currencyColor(currency) }]} />
                <Text style={[styles.currencyTitle, { color: currencyColor(currency) }]}>
                  {currency} Economy
                </Text>
              </View>

              {/* Core instrument sections */}
              {SECTION_ORDER.filter(s => s !== 'commodities').map((sectionKey) => {
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

              {/* Commodities section */}
              {commodities.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Commodities</Text>
                  {commodities.map((inst) => (
                    <InstrumentCard key={inst.id} instrument={inst} />
                  ))}
                </View>
              )}
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

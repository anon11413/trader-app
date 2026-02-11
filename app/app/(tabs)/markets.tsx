/**
 * Markets tab — shows instruments grouped by sector, with all currencies
 * shown together within each sector (e.g. ETFs: EUR, USD, YEN side by side).
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { Text, SegmentedButtons } from 'react-native-paper';
import InstrumentCard from '../../components/InstrumentCard';
import { colors, spacing, fontSize, currencyColor } from '../../theme';
import { getCurrencySymbol } from '../../lib/format';
import { useStore, InstrumentPrice } from '../../lib/store';
import { gameSocket } from '../../lib/socket';
import { CURRENCIES, INSTRUMENTS, SECTION_TITLES, SECTION_ORDER } from '../../lib/instruments';
import type { Currency } from '../../lib/instruments';
import * as simApi from '../../lib/simApi';

export default function MarketsScreen() {
  const { prices, commodityPrices, forexPrices, setPrices, setCommodityPrices, setForexPrices, simDate } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | Currency>('all');
  const [displayCurrency, setDisplayCurrency] = useState<string | null>(null); // null = native prices

  // Fetch prices for all currencies (core + commodities + forex)
  const fetchPrices = useCallback(async () => {
    try {
      await Promise.all(
        CURRENCIES.map(async (cur) => {
          const [core, commodities, forex] = await Promise.all([
            simApi.getInstruments(cur) as Promise<InstrumentPrice[]>,
            simApi.getCommodities(cur) as Promise<InstrumentPrice[]>,
            simApi.getForex(cur) as Promise<InstrumentPrice[]>,
          ]);
          setPrices(cur, core);
          setCommodityPrices(cur, commodities);
          setForexPrices(cur, forex);
        })
      );
    } catch (e) {
      console.error('[Markets] Failed to fetch prices:', e);
    }
  }, [setPrices, setCommodityPrices, setForexPrices]);

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
        if (data.forex) setForexPrices(data.currency, data.forex);
      }
    });
    return unsub;
  }, [setPrices, setCommodityPrices, setForexPrices]);

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

  const currenciesToShow: readonly string[] = viewMode === 'all' ? CURRENCIES : [viewMode];

  // Collect all unique commodity IDs across all currencies
  const allCommodityIds = useMemo(() => {
    const ids = new Set<string>();
    for (const cur of currenciesToShow) {
      for (const c of (commodityPrices[cur] || [])) {
        ids.add(c.id);
      }
    }
    return Array.from(ids).sort();
  }, [commodityPrices, currenciesToShow]);

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

      {/* "Price in" display currency toggle */}
      <View style={styles.priceInRow}>
        <Text style={styles.priceInLabel}>Price in:</Text>
        <Pressable
          style={[styles.priceInChip, !displayCurrency && styles.priceInChipActive]}
          onPress={() => setDisplayCurrency(null)}
        >
          <Text style={[styles.priceInChipText, !displayCurrency && styles.priceInChipTextActive]}>
            Native
          </Text>
        </Pressable>
        {CURRENCIES.map((cur) => (
          <Pressable
            key={cur}
            style={[styles.priceInChip, displayCurrency === cur && styles.priceInChipActive]}
            onPress={() => setDisplayCurrency(displayCurrency === cur ? null : cur)}
          >
            <Text style={[styles.priceInChipText, displayCurrency === cur && styles.priceInChipTextActive]}>
              {getCurrencySymbol(cur)} {cur}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Instrument list — grouped by section, currencies within each */}
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
        {/* Core instrument sections (ETFs, Credit Bank, Market Prices) */}
        {SECTION_ORDER.filter(s => s !== 'commodities').map((sectionKey) => {
          // Get the instrument IDs that belong to this section
          const sectionInstrumentDefs = INSTRUMENTS.filter(i => i.section === sectionKey);
          if (sectionInstrumentDefs.length === 0) return null;

          // Collect all cards: for each instrument in the section, show all currencies
          const cards: InstrumentPrice[] = [];
          for (const def of sectionInstrumentDefs) {
            for (const cur of currenciesToShow) {
              const found = (prices[cur] || []).find(i => i.id === def.id);
              if (found) cards.push(found);
            }
          }

          if (cards.length === 0) return null;

          return (
            <View key={sectionKey} style={styles.section}>
              <Text style={styles.sectionTitle}>
                {SECTION_TITLES[sectionKey] || sectionKey}
              </Text>
              {cards.map((inst) => (
                <InstrumentCard
                  key={`${inst.id}-${inst.currency}`}
                  instrument={inst}
                  displayCurrency={displayCurrency || undefined}
                  forexRates={displayCurrency ? forexPrices : undefined}
                />
              ))}
            </View>
          );
        })}

        {/* Commodities section — group by commodity name, all currencies together */}
        {allCommodityIds.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Commodities</Text>
            {allCommodityIds.map((commodityId) => {
              const cards: InstrumentPrice[] = [];
              for (const cur of currenciesToShow) {
                const found = (commodityPrices[cur] || []).find(i => i.id === commodityId);
                if (found) cards.push(found);
              }
              return cards.map((inst) => (
                <InstrumentCard
                  key={`${inst.id}-${inst.currency}`}
                  instrument={inst}
                  displayCurrency={displayCurrency || undefined}
                  forexRates={displayCurrency ? forexPrices : undefined}
                />
              ));
            })}
          </View>
        )}

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
  priceInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  priceInLabel: {
    fontSize: fontSize.sm,
    color: colors.textDim,
    fontWeight: '600',
    marginRight: spacing.xs,
  },
  priceInChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  priceInChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryDim,
  },
  priceInChipText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textDim,
  },
  priceInChipTextActive: {
    color: '#fff',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    color: colors.textDim,
    fontWeight: '600',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
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

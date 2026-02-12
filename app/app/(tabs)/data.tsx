/**
 * Data tab — browse all simulation data categories with mini charts.
 * Categories match the web dashboard: Money, Households, Industries, Prices,
 * Banks, National, Transactions, Agents.
 * Each category is expandable, showing data charts.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, Platform } from 'react-native';
import { Text, SegmentedButtons } from 'react-native-paper';
import MiniChart from '../../components/MiniChart';
import { colors, spacing, fontSize, currencyColor } from '../../theme';
import { CURRENCIES } from '../../lib/instruments';
import type { Currency } from '../../lib/instruments';
import * as simApi from '../../lib/simApi';

interface DataCategory {
  key: string;
  title: string;
  type: 'balance_sheet' | 'timeseries' | 'ohlcv';
  /** For balance_sheet: agent type. For timeseries: category name. */
  source: string;
  /** Which fields to show */
  fields?: string[];
}

const DATA_CATEGORIES: DataCategory[] = [
  {
    key: 'households',
    title: 'Households',
    type: 'balance_sheet',
    source: 'Household',
    fields: ['equity', 'hardCash', 'bonds'],
  },
  {
    key: 'factories',
    title: 'Industries',
    type: 'balance_sheet',
    source: 'Factory',
    fields: ['equity', 'hardCash', 'inventoryValue', 'bankLoans'],
  },
  {
    key: 'creditBank',
    title: 'Credit Banks',
    type: 'balance_sheet',
    source: 'CreditBank',
    fields: ['equity', 'hardCash', 'bonds', 'bankBorrowings'],
  },
  {
    key: 'centralBank',
    title: 'Central Bank',
    type: 'balance_sheet',
    source: 'CentralBank',
    fields: ['equity', 'hardCash', 'bonds'],
  },
  {
    key: 'national',
    title: 'National Economy',
    type: 'balance_sheet',
    source: 'National',
    fields: ['equity', 'hardCash'],
  },
  {
    key: 'prices',
    title: 'Market Prices',
    type: 'ohlcv',
    source: 'good',
  },
];

interface ChartItem {
  title: string;
  data: number[];
  positive: boolean;
}

export default function DataScreen() {
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [categoryData, setCategoryData] = useState<Record<string, ChartItem[]>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCategory = useCallback(async (cat: DataCategory, cur: string) => {
    setLoading(cat.key);
    try {
      let items: ChartItem[] = [];

      if (cat.type === 'balance_sheet') {
        const data = await simApi.getBalanceSheet(cur, cat.source);
        for (const field of (cat.fields || ['equity'])) {
          const values: number[] = (data as any)[field] || [];
          if (values.length > 0) {
            const last50 = values.slice(Math.max(0, values.length - 50));
            const isUp = last50.length >= 2 && last50[last50.length - 1] >= last50[0];
            items.push({
              title: formatFieldName(field),
              data: last50,
              positive: isUp,
            });
          }
        }
      } else if (cat.type === 'ohlcv') {
        // Fetch available OHLCV assets
        const assets = await simApi.getOhlcvAssets(cur) as any;
        const assetList = assets?.assets || [];
        for (const asset of assetList.slice(0, 6)) {
          try {
            const ohlcv = await simApi.getOhlcv(cur, asset.assetType, asset.assetName);
            const close = ohlcv.close || [];
            const last50 = close.slice(Math.max(0, close.length - 50));
            const isUp = last50.length >= 2 && last50[last50.length - 1] >= last50[0];
            items.push({
              title: `${asset.assetName} (${asset.assetType})`,
              data: last50,
              positive: isUp,
            });
          } catch {
            // Skip failed assets
          }
        }
      }

      setCategoryData(prev => ({ ...prev, [cat.key]: items }));
    } catch (e) {
      console.error(`[Data] Failed to fetch ${cat.key}:`, e);
    } finally {
      setLoading(null);
    }
  }, []);

  function toggleCategory(key: string) {
    if (expanded === key) {
      setExpanded(null);
    } else {
      setExpanded(key);
      const cat = DATA_CATEGORIES.find(c => c.key === key);
      if (cat && !categoryData[key]) {
        fetchCategory(cat, currency);
      }
    }
  }

  // Refetch when currency changes
  useEffect(() => {
    if (expanded) {
      const cat = DATA_CATEGORIES.find(c => c.key === expanded);
      if (cat) fetchCategory(cat, currency);
    }
  }, [currency]);

  // Auto-refresh every 2 seconds when a category is expanded
  useEffect(() => {
    if (!expanded) return;
    const interval = setInterval(() => {
      const cat = DATA_CATEGORIES.find(c => c.key === expanded);
      if (cat) fetchCategory(cat, currency);
    }, 2000);
    return () => clearInterval(interval);
  }, [expanded, currency, fetchCategory]);

  // Arrow key currency switching (web only)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrency(prev => {
          const idx = CURRENCIES.indexOf(prev);
          if (e.key === 'ArrowRight') {
            return CURRENCIES[(idx + 1) % CURRENCIES.length];
          } else {
            return CURRENCIES[(idx - 1 + CURRENCIES.length) % CURRENCIES.length];
          }
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setCategoryData({});
    if (expanded) {
      const cat = DATA_CATEGORIES.find(c => c.key === expanded);
      if (cat) await fetchCategory(cat, currency);
    }
    setRefreshing(false);
  }, [expanded, currency, fetchCategory]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Simulation Data</Text>
      </View>

      {/* Currency selector */}
      <View style={styles.selectorRow}>
        <SegmentedButtons
          value={currency}
          onValueChange={(v) => setCurrency(v as Currency)}
          buttons={CURRENCIES.map(c => ({ value: c, label: c }))}
          style={styles.segmented}
          theme={{
            colors: {
              secondaryContainer: currencyColor(currency),
              onSecondaryContainer: '#000',
              onSurface: colors.textDim,
            },
          }}
        />
      </View>

      {/* Category list */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {DATA_CATEGORIES.map((cat) => {
          const isExpanded = expanded === cat.key;
          const items = categoryData[cat.key] || [];
          const isLoading = loading === cat.key;

          return (
            <View key={cat.key} style={styles.categoryBlock}>
              <Pressable
                style={[styles.categoryHeader, isExpanded && styles.categoryHeaderExpanded]}
                onPress={() => toggleCategory(cat.key)}
              >
                <Text style={styles.categoryTitle}>{cat.title}</Text>
                <Text style={styles.categoryArrow}>{isExpanded ? '▼' : '▶'}</Text>
              </Pressable>

              {isExpanded && (
                <View style={styles.categoryContent}>
                  {isLoading && items.length === 0 && (
                    <Text style={styles.loadingText}>Loading data...</Text>
                  )}
                  {items.map((item, i) => (
                    <View key={i} style={styles.dataRow}>
                      <View style={styles.dataInfo}>
                        <Text style={styles.dataTitle}>{item.title}</Text>
                      </View>
                      <MiniChart
                        data={item.data}
                        width={100}
                        height={36}
                        positive={item.positive}
                      />
                    </View>
                  ))}
                  {!isLoading && items.length === 0 && (
                    <Text style={styles.noData}>No data available</Text>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function formatFieldName(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
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
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  categoryBlock: {
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
  },
  categoryHeaderExpanded: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoryTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  categoryArrow: {
    fontSize: fontSize.sm,
    color: colors.textDim,
  },
  categoryContent: {
    padding: spacing.md,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dataInfo: {
    flex: 1,
  },
  dataTitle: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '500',
  },
  loadingText: {
    color: colors.textDim,
    fontSize: fontSize.md,
    textAlign: 'center',
    padding: spacing.lg,
  },
  noData: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
    padding: spacing.lg,
    fontStyle: 'italic',
  },
});

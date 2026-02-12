/**
 * Instrument detail screen — full chart + trade panel.
 * Navigated from Markets tab via InstrumentCard tap.
 * Supports core instruments, dynamic GOOD_* commodities, and FOREX_* pairs.
 */
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, IconButton, SegmentedButtons } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import FullChart from '../../components/FullChart';
import TradePanel from '../../components/TradePanel';
import { colors, spacing, fontSize, currencyColor } from '../../theme';
import { formatPrice, formatChange, formatCurrency } from '../../lib/format';
import { getInstrumentDisplayName, getInstrument } from '../../lib/instruments';
import { useStore } from '../../lib/store';
import { gameSocket } from '../../lib/socket';
import * as simApi from '../../lib/simApi';
import { PRICE_DIVISOR, INDEX_BASE } from '../../lib/instruments';

interface ChartPoint {
  date: string;
  value: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

export default function InstrumentDetailScreen() {
  const { id, currency } = useLocalSearchParams<{ id: string; currency: string }>();
  const router = useRouter();
  const { prices, commodityPrices, forexPrices, portfolio } = useStore();

  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [chartMode, setChartMode] = useState<'line' | 'candle'>('line');
  const [loading, setLoading] = useState(true);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chartRefreshDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const def = getInstrument(id || '');
  const displayName = getInstrumentDisplayName(id || '', currency || 'EUR');

  // Get current price from store — search core, commodities, and forex
  const currentInstrument = useMemo(() => {
    const cur = currency || 'EUR';
    // Core instruments
    const core = prices[cur] || [];
    const found = core.find(i => i.id === id);
    if (found) return found;
    // Commodities
    const commodities = commodityPrices[cur] || [];
    const foundCommodity = commodities.find(i => i.id === id);
    if (foundCommodity) return foundCommodity;
    // Forex
    const forex = forexPrices[cur] || [];
    const foundForex = forex.find(i => i.id === id);
    if (foundForex) return foundForex;
    return undefined;
  }, [prices, commodityPrices, forexPrices, id, currency]);

  // Fetch chart data
  const fetchChart = useCallback(async (showLoading = false) => {
    if (!id || !currency) return;
    if (showLoading) setLoading(true);
    try {
      const data = await simApi.getInstrumentChart(currency, id);
      const points: ChartPoint[] = [];

      if ((data as any).type === 'balance_sheet') {
        // Balance sheet data — transform to line chart points
        const bs = data as any;
        const dates: string[] = bs.dates || [];
        const equity: number[] = bs.equity || [];

        for (let i = 0; i < dates.length; i++) {
          let value = Math.max(0, equity[i] || 0);
          // Apply transform based on instrument type
          if (id === 'CREDITBANK_MA') {
            value = value / PRICE_DIVISOR;
          } else if (id === 'BROAD_MARKET_ETF') {
            const base = Math.max(1, equity[0] || 1);
            value = (Math.max(0, equity[i] || 0) / base) * INDEX_BASE;
          }
          points.push({ date: dates[i], value });
        }
      } else {
        // OHLCV data — core MACHINE, all GOOD_*, and FOREX_* instruments
        const ohlcv = data as any;
        const dates: string[] = ohlcv.dates || [];
        for (let i = 0; i < dates.length; i++) {
          points.push({
            date: dates[i],
            value: ohlcv.close?.[i] ?? 0,
            open: ohlcv.open?.[i],
            high: ohlcv.high?.[i],
            low: ohlcv.low?.[i],
            close: ohlcv.close?.[i],
          });
        }
        // OHLCV instruments can show candlesticks
        if (def?.isOhlcv && showLoading) {
          setChartMode('candle');
        }
      }

      setChartData(points);
    } catch (e) {
      console.error('[Chart] Failed to fetch:', e);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [id, currency, def]);

  // Initial fetch
  useEffect(() => {
    fetchChart(true);
  }, [fetchChart]);

  // Auto-refresh chart every 2 seconds as a fallback
  useEffect(() => {
    refreshIntervalRef.current = setInterval(() => {
      fetchChart(false); // silent refresh, no loading spinner
    }, 2000);
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [fetchChart]);

  // Listen for socket price updates to trigger a debounced chart refresh
  useEffect(() => {
    const unsub = gameSocket.on('price_update', () => {
      // Debounce: refresh chart 500ms after last price_update to batch rapid updates
      if (chartRefreshDebounce.current) clearTimeout(chartRefreshDebounce.current);
      chartRefreshDebounce.current = setTimeout(() => {
        fetchChart(false);
      }, 500);
    });
    return () => {
      unsub();
      if (chartRefreshDebounce.current) clearTimeout(chartRefreshDebounce.current);
    };
  }, [fetchChart]);

  const isPositive = (currentInstrument?.changePercent ?? 0) >= 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          iconColor={colors.text}
          size={24}
          onPress={() => router.back()}
        />
        <View style={styles.headerInfo}>
          <Text style={styles.instrumentName}>{displayName}</Text>
          <Text style={[styles.currencyBadge, { color: currencyColor(currency || 'EUR') }]}>
            {currency}
          </Text>
        </View>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {/* Price header */}
        <View style={styles.priceHeader}>
          <Text style={styles.currentPrice}>
            {currentInstrument
              ? formatPrice(currentInstrument.price, currency || 'EUR')
              : '—'}
          </Text>
          {currentInstrument && (
            <Text style={[styles.change, { color: isPositive ? colors.success : colors.error }]}>
              {formatChange(currentInstrument.changePercent)} ({formatCurrency(currentInstrument.change, currency || 'EUR')})
            </Text>
          )}
        </View>

        {/* Chart mode toggle */}
        {def?.isOhlcv && (
          <View style={styles.chartToggle}>
            <SegmentedButtons
              value={chartMode}
              onValueChange={(v) => setChartMode(v as 'line' | 'candle')}
              buttons={[
                { value: 'line', label: 'Line' },
                { value: 'candle', label: 'Candle' },
              ]}
              density="small"
              style={styles.chartToggleButtons}
              theme={{
                colors: {
                  secondaryContainer: colors.primaryDim,
                  onSecondaryContainer: '#fff',
                  onSurface: colors.textDim,
                },
              }}
            />
          </View>
        )}

        {/* Chart */}
        <View style={styles.chartContainer}>
          {loading ? (
            <View style={styles.chartLoading}>
              <Text style={styles.loadingText}>Loading chart...</Text>
            </View>
          ) : (
            <FullChart
              data={chartData}
              mode={chartMode}
              height={300}
            />
          )}
        </View>

        {/* Trade panel */}
        <View style={styles.tradePanelWrapper}>
          <TradePanel
            instrumentId={id || ''}
            instrumentName={displayName}
            currentPrice={currentInstrument?.price ?? 0}
            currency={currency || 'EUR'}
          />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
  },
  headerInfo: {
    flex: 1,
    alignItems: 'center',
  },
  instrumentName: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  currencyBadge: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  priceHeader: {
    marginBottom: spacing.md,
  },
  currentPrice: {
    fontSize: fontSize.hero,
    fontWeight: '700',
    color: colors.text,
  },
  change: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  chartToggle: {
    marginBottom: spacing.md,
  },
  chartToggleButtons: {
    maxWidth: 200,
  },
  chartContainer: {
    marginBottom: spacing.lg,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  chartLoading: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textDim,
    fontSize: fontSize.md,
  },
  tradePanelWrapper: {
    marginTop: spacing.md,
  },
});

/**
 * InstrumentCard — Webull/Robinhood-style card showing instrument name,
 * price, % change, and mini sparkline. Tappable to navigate to full chart.
 */
import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import MiniChart from './MiniChart';
import { colors, spacing, fontSize, currencyColor } from '../theme';
import { formatPrice, formatChange } from '../lib/format';
import { getInstrumentDisplayName } from '../lib/instruments';
import type { InstrumentPrice } from '../lib/store';

interface InstrumentCardProps {
  instrument: InstrumentPrice;
  /** If set, show price converted to this currency using forexRates */
  displayCurrency?: string;
  /** Forex rates keyed by base currency, needed when displayCurrency is set */
  forexRates?: Record<string, InstrumentPrice[]>;
  /** If set, divide price by this value for inflation adjustment (labour hour price) */
  labourPrice?: number;
}

/** Convert a price from one currency to another using forex rates in the store */
function convertPrice(
  price: number,
  fromCurrency: string,
  toCurrency: string,
  forexRates: Record<string, InstrumentPrice[]>,
): number {
  if (fromCurrency === toCurrency) return price;
  const rates = forexRates[fromCurrency] || [];
  const rateInst = rates.find(f => f.id === `FOREX_${toCurrency}`);
  if (!rateInst) return price; // fallback — no rate available
  return price * rateInst.price;
}

export default function InstrumentCard({ instrument, displayCurrency, forexRates, labourPrice }: InstrumentCardProps) {
  const router = useRouter();
  const isPositive = instrument.changePercent >= 0;
  const changeColor = isPositive ? colors.success : colors.error;
  const displayName = getInstrumentDisplayName(instrument.id, instrument.currency);
  const curColor = currencyColor(instrument.currency);

  // Determine the price and currency to display
  const showCurrency = displayCurrency || instrument.currency;
  let showPrice = (displayCurrency && forexRates)
    ? convertPrice(instrument.price, instrument.currency, displayCurrency, forexRates)
    : instrument.price;

  // Inflation adjustment: divide by labour price to get "real" price
  const isInflationAdjusted = labourPrice && labourPrice > 0;
  if (isInflationAdjusted) {
    showPrice = showPrice / labourPrice;
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
      onPress={() =>
        router.push(`/instrument/${instrument.id}?currency=${instrument.currency}`)
      }
    >
      {/* Left: currency tag + name */}
      <View style={styles.nameSection}>
        <View style={styles.nameRow}>
          <View style={[styles.currencyTag, { backgroundColor: curColor + '20', borderColor: curColor + '40' }]}>
            <Text style={[styles.currencyTagText, { color: curColor }]}>
              {instrument.currency}
            </Text>
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
        </View>
      </View>

      {/* Center: sparkline */}
      <View style={styles.chartSection}>
        <MiniChart
          data={instrument.sparkline}
          width={80}
          height={32}
          positive={isPositive}
        />
      </View>

      {/* Right: price + change */}
      <View style={styles.priceSection}>
        <Text style={[styles.price, isInflationAdjusted && styles.priceAdjusted]}>
          {isInflationAdjusted ? showPrice.toFixed(2) + ' LH' : formatPrice(showPrice, showCurrency)}
        </Text>
        <View style={[styles.changeBadge, { backgroundColor: isPositive ? '#1b5e2015' : '#b7171715' }]}>
          <Text style={[styles.changeText, { color: changeColor }]}>
            {formatChange(instrument.changePercent)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: {
    backgroundColor: colors.surfaceLight,
  },
  nameSection: {
    flex: 1,
    minWidth: 100,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  currencyTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  currencyTagText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  name: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    flexShrink: 1,
  },
  chartSection: {
    paddingHorizontal: spacing.sm,
  },
  priceSection: {
    alignItems: 'flex-end',
    minWidth: 90,
  },
  price: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  priceAdjusted: {
    color: '#ffb74d',
  },
  changeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  changeText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});

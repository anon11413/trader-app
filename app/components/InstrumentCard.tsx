/**
 * InstrumentCard — Webull/Robinhood-style card showing instrument name,
 * price, % change, and mini sparkline. Tappable to navigate to full chart.
 */
import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import MiniChart from './MiniChart';
import { colors, spacing, fontSize } from '../theme';
import { formatPrice, formatChange } from '../lib/format';
import { getInstrumentDisplayName } from '../lib/instruments';
import type { InstrumentPrice } from '../lib/store';

/** Section badge abbreviation and color */
function getSectionBadge(section: string): { label: string; color: string } {
  switch (section) {
    case 'etfs':        return { label: 'ETF', color: colors.primary };
    case 'credit_bank': return { label: 'BANK', color: '#6dd5ed' };
    case 'market_prices': return { label: 'MKT', color: '#f5af19' };
    case 'commodities': return { label: 'CMDTY', color: '#a8e063' };
    case 'forex':       return { label: 'FX', color: '#ee9ca7' };
    default:            return { label: section.toUpperCase().slice(0, 4), color: colors.textDim };
  }
}

interface InstrumentCardProps {
  instrument: InstrumentPrice;
}

export default function InstrumentCard({ instrument }: InstrumentCardProps) {
  const router = useRouter();
  const isPositive = instrument.changePercent >= 0;
  const changeColor = isPositive ? colors.success : colors.error;
  const displayName = getInstrumentDisplayName(instrument.id, instrument.currency);
  const badge = getSectionBadge(instrument.section);

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
      {/* Left: name */}
      <View style={styles.nameSection}>
        <Text style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={[styles.sectionBadge, { color: badge.color }]}>
          {badge.label}
        </Text>
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
        <Text style={styles.price}>
          {formatPrice(instrument.price, instrument.currency)}
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
  name: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  sectionBadge: {
    fontSize: fontSize.xs,
    marginTop: 2,
    letterSpacing: 1,
    fontWeight: '700',
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

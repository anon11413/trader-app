/**
 * FullChart — line/candlestick chart using react-native-svg.
 * Supports OHLCV candlestick and line chart modes.
 */
import React, { useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Text } from 'react-native-paper';
import Svg, { Path, Rect, Line, G, Text as SvgText } from 'react-native-svg';
import { colors, spacing, fontSize } from '../theme';
import { formatCompact } from '../lib/format';

interface ChartDataPoint {
  date: string;
  value: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

interface FullChartProps {
  data: ChartDataPoint[];
  mode: 'line' | 'candle';
  width?: number;
  height?: number;
}

const CHART_PADDING = { top: 20, right: 60, bottom: 30, left: 10 };

export default function FullChart({
  data,
  mode = 'line',
  width: propWidth,
  height = 280,
}: FullChartProps) {
  const screenWidth = Dimensions.get('window').width;
  const width = propWidth || screenWidth - spacing.lg * 2;

  const chartWidth = width - CHART_PADDING.left - CHART_PADDING.right;
  const chartHeight = height - CHART_PADDING.top - CHART_PADDING.bottom;

  const { minVal, maxVal, yScale, xScale, yTicks } = useMemo(() => {
    if (!data || data.length === 0) {
      return { minVal: 0, maxVal: 1, yScale: () => 0, xScale: () => 0, yTicks: [] };
    }

    let min = Infinity, max = -Infinity;
    for (const d of data) {
      if (mode === 'candle' && d.high !== undefined && d.low !== undefined) {
        if (d.high > max) max = d.high;
        if (d.low < min) min = d.low;
      } else {
        if (d.value > max) max = d.value;
        if (d.value < min) min = d.value;
      }
    }

    // Add 5% padding
    const range = max - min || 1;
    min -= range * 0.05;
    max += range * 0.05;

    const ys = (v: number) =>
      CHART_PADDING.top + chartHeight - ((v - min) / (max - min)) * chartHeight;
    const xs = (i: number) =>
      CHART_PADDING.left + (i / Math.max(1, data.length - 1)) * chartWidth;

    // Generate y-axis ticks
    const tickCount = 5;
    const ticks: number[] = [];
    for (let i = 0; i <= tickCount; i++) {
      ticks.push(min + (i / tickCount) * (max - min));
    }

    return { minVal: min, maxVal: max, yScale: ys, xScale: xs, yTicks: ticks };
  }, [data, mode, chartWidth, chartHeight]);

  const linePath = useMemo(() => {
    if (!data || data.length < 2 || mode !== 'line') return '';
    let path = `M ${xScale(0)},${yScale(data[0].value)}`;
    for (let i = 1; i < data.length; i++) {
      const prev = { x: xScale(i - 1), y: yScale(data[i - 1].value) };
      const curr = { x: xScale(i), y: yScale(data[i].value) };
      const cpx = (prev.x + curr.x) / 2;
      path += ` C ${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
    }
    return path;
  }, [data, mode, xScale, yScale]);

  if (!data || data.length === 0) {
    return (
      <View style={[styles.container, { width, height }]}>
        <Text style={styles.noData}>No chart data</Text>
      </View>
    );
  }

  const isPositive = data.length >= 2 && data[data.length - 1].value >= data[0].value;
  const lineColor = isPositive ? colors.success : colors.error;

  // Candlestick bar width
  const barWidth = Math.max(1, Math.min(8, (chartWidth / data.length) * 0.6));

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height}>
        {/* Grid lines + Y axis labels */}
        {yTicks.map((tick, i) => (
          <G key={i}>
            <Line
              x1={CHART_PADDING.left}
              y1={yScale(tick)}
              x2={width - CHART_PADDING.right}
              y2={yScale(tick)}
              stroke={colors.border}
              strokeWidth={0.5}
              strokeDasharray="4,4"
            />
            <SvgText
              x={width - CHART_PADDING.right + 4}
              y={yScale(tick) + 4}
              fill={colors.textDim}
              fontSize={9}
            >
              {formatCompact(tick)}
            </SvgText>
          </G>
        ))}

        {/* Line chart */}
        {mode === 'line' && linePath && (
          <Path
            d={linePath}
            stroke={lineColor}
            strokeWidth={2}
            fill="none"
          />
        )}

        {/* Candlestick chart */}
        {mode === 'candle' && data.map((d, i) => {
          if (d.open === undefined || d.close === undefined || d.high === undefined || d.low === undefined) {
            return null;
          }
          const x = xScale(i);
          const isUp = d.close >= d.open;
          const candleColor = isUp ? colors.success : colors.error;
          const bodyTop = yScale(Math.max(d.open, d.close));
          const bodyBottom = yScale(Math.min(d.open, d.close));
          const bodyHeight = Math.max(1, bodyBottom - bodyTop);

          return (
            <G key={i}>
              {/* Wick */}
              <Line
                x1={x}
                y1={yScale(d.high)}
                x2={x}
                y2={yScale(d.low)}
                stroke={candleColor}
                strokeWidth={1}
              />
              {/* Body */}
              <Rect
                x={x - barWidth / 2}
                y={bodyTop}
                width={barWidth}
                height={bodyHeight}
                fill={isUp ? candleColor : candleColor}
                stroke={candleColor}
                strokeWidth={0.5}
              />
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
  },
  noData: {
    color: colors.textDim,
    textAlign: 'center',
    marginTop: 100,
    fontSize: fontSize.lg,
  },
});

/**
 * MiniChart — tiny SVG sparkline for instrument cards.
 * Green gradient if positive change, red if negative.
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors } from '../theme';

interface MiniChartProps {
  data: number[];
  width?: number;
  height?: number;
  positive?: boolean;
}

export default function MiniChart({
  data,
  width = 80,
  height = 32,
  positive = true,
}: MiniChartProps) {
  const { linePath, areaPath, color } = useMemo(() => {
    if (!data || data.length < 2) {
      return { linePath: '', areaPath: '', color: colors.textDim };
    }

    const isUp = positive;
    const lineColor = isUp ? colors.success : colors.error;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padding = 2;
    const w = width - padding * 2;
    const h = height - padding * 2;

    const points = data.map((v, i) => ({
      x: padding + (i / (data.length - 1)) * w,
      y: padding + h - ((v - min) / range) * h,
    }));

    // Build smooth cubic bezier path
    let line = `M ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      line += ` C ${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
    }

    // Area path (close to bottom)
    const last = points[points.length - 1];
    const area = `${line} L ${last.x},${height} L ${points[0].x},${height} Z`;

    return { linePath: line, areaPath: area, color: lineColor };
  }, [data, width, height, positive]);

  if (!data || data.length < 2) {
    return <View style={{ width, height }} />;
  }

  const gradientId = positive ? 'gradUp' : 'gradDown';

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.3" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={areaPath} fill={`url(#${gradientId})`} />
      <Path d={linePath} stroke={color} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

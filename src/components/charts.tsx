import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';

export type ChartPoint = { label: string; value: number };

// 依存ライブラリなしのシンプルな棒グラフ。
// 最新側（右端）を強調し、最小/最大とラベルを表示する。
// onBarLongPress で各ポイントの詳細（店舗情報など）を親に通知できる。
export function BarChart({
  title,
  points,
  color = colors.primary,
  unit = '',
  maxBars = 14,
  baseline = 'zero',
  onBarLongPress,
  selectedIndex
}: {
  title: string;
  points: ChartPoint[];
  color?: string;
  unit?: string;
  maxBars?: number;
  baseline?: 'zero' | 'min'; // 体重のように変化幅が小さいものは 'min'
  onBarLongPress?: (index: number) => void; // points配列上のインデックス
  selectedIndex?: number | null;
}) {
  const visible = points.slice(-maxBars);
  if (visible.length === 0) {
    return (
      <View style={styles.chart}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.emptyText}>データがまだありません</Text>
      </View>
    );
  }
  const values = visible.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const floor = baseline === 'min' ? min - (max - min || 1) * 0.4 : 0;
  const span = max - floor || 1;
  const latest = visible[visible.length - 1];

  return (
    <View style={styles.chart}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.latest}>
          {formatValue(latest.value)}
          <Text style={styles.unit}> {unit}</Text>
        </Text>
      </View>
      <View style={styles.bars}>
        {visible.map((point, index) => {
          const h = Math.max(4, ((point.value - floor) / span) * 92);
          const isLast = index === visible.length - 1;
          const originalIndex = points.length - visible.length + index;
          const isSelected = selectedIndex != null && selectedIndex === originalIndex;
          return (
            <Pressable
              key={`${point.label}-${index}`}
              style={styles.barColumn}
              onLongPress={onBarLongPress ? () => onBarLongPress(originalIndex) : undefined}
              delayLongPress={250}
            >
              <View
                style={[
                  styles.bar,
                  { height: h, backgroundColor: isSelected ? colors.brass : isLast ? color : `${color}55` }
                ]}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.axis}>
        <Text style={styles.axisText}>{visible[0].label}</Text>
        <Text style={styles.axisText}>
          {formatValue(min)}〜{formatValue(max)} {unit}
        </Text>
        <Text style={styles.axisText}>{latest.label}</Text>
      </View>
    </View>
  );
}

// 横向きの比較バー（部位別ボリュームなど）
export function HBarList({
  title,
  points,
  color = colors.primary,
  unit = ''
}: {
  title: string;
  points: ChartPoint[];
  color?: string;
  unit?: string;
}) {
  const max = Math.max(...points.map((p) => p.value), 1);
  return (
    <View style={styles.chart}>
      <Text style={styles.title}>{title}</Text>
      {points.length === 0 ? <Text style={styles.emptyText}>データがまだありません</Text> : null}
      {points.map((point) => (
        <View key={point.label} style={styles.hRow}>
          <Text style={styles.hLabel} numberOfLines={1}>{point.label}</Text>
          <View style={styles.hTrack}>
            <View style={[styles.hFill, { width: `${(point.value / max) * 100}%`, backgroundColor: color }]} />
          </View>
          <Text style={styles.hValue}>{formatValue(point.value)}{unit}</Text>
        </View>
      ))}
    </View>
  );
}

function formatValue(value: number): string {
  if (Math.abs(value) >= 10000) return `${Math.round(value / 1000)}k`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const styles = StyleSheet.create({
  chart: {
    marginTop: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { fontSize: 14, fontWeight: '800', color: colors.ink },
  latest: { fontSize: 18, fontWeight: '800', color: colors.ink },
  unit: { fontSize: 12, color: colors.faint, fontWeight: '600' },
  bars: { height: 100, flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 12 },
  barColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  axisText: { fontSize: 10, color: colors.faint },
  emptyText: { color: colors.faint, fontSize: 13, marginTop: 10 },
  hRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  hLabel: { width: 76, fontSize: 12, fontWeight: '700', color: colors.sub },
  hTrack: { flex: 1, height: 12, borderRadius: 999, backgroundColor: '#23262E', overflow: 'hidden' },
  hFill: { height: '100%', borderRadius: 999 },
  hValue: { width: 60, textAlign: 'right', fontSize: 12, fontWeight: '700', color: colors.ink }
});

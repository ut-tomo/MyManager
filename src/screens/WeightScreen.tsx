import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { BarChart } from '../components/charts';
import { Badge, Button, Card, EmptyState, SectionTitle, Stepper, confirmDelete } from '../components/ui';
import { addBodyWeightLog, getBodyWeights, getProfile, softDelete } from '../db/client';
import { colors } from '../theme';
import type { BodyWeightLog, UserProfile } from '../types';

type WeightRow = BodyWeightLog & { moving_average_7d: number };

export function WeightScreen({ refresh, refreshKey }: { refresh: () => void; refreshKey: number }) {
  const [value, setValue] = useState('');
  const [logs, setLogs] = useState<WeightRow[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const load = useCallback(async () => {
    const [rows, p] = await Promise.all([getBodyWeights(60), getProfile()]);
    setLogs(rows);
    setProfile(p);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function save() {
    // 未編集ならステッパーに表示中の前回値をそのまま保存できるようにする
    const weight = Number(value || (latest ? latest.weight_kg.toFixed(1) : ''));
    if (!weight || weight <= 0) return;
    await addBodyWeightLog(weight);
    setValue('');
    await load();
    refresh();
  }

  const latest = logs[0] ?? null;
  const target = profile?.target_weight_kg ?? null;
  const targetDiff = latest && target != null ? Math.round((latest.moving_average_7d - target) * 10) / 10 : null;

  // 週間変化量: 7日移動平均の今 vs 7日前
  const weekAgo = logs.find((log, index) => index > 0 && daysBetween(log.date, latest?.date ?? log.date) >= 7) ?? null;
  const weeklyChange = latest && weekAgo ? Math.round((latest.moving_average_7d - weekAgo.moving_average_7d) * 10) / 10 : null;

  const asc = [...logs].reverse();

  return (
    <Screen title="体重">
      {/* 入力 */}
      <Card>
        <View style={styles.rowGap}>
          <Stepper
            label="今日の体重 (kg)"
            value={value || (latest ? latest.weight_kg.toFixed(1) : '')}
            onChange={setValue}
            step={0.1}
            decimals={1}
          />
          <Button label="保存" icon="checkmark" onPress={save} style={{ alignSelf: 'flex-end', minWidth: 92 }} />
        </View>
      </Card>

      {/* サマリー */}
      <Card>
        <View style={styles.statsRow}>
          <Stat label="最新" value={latest ? `${latest.weight_kg.toFixed(1)}kg` : '-'} />
          <Stat label="7日平均" value={latest ? `${latest.moving_average_7d.toFixed(1)}kg` : '-'} />
          <Stat
            label="目標まで"
            value={targetDiff != null ? `${targetDiff > 0 ? '+' : ''}${targetDiff}kg` : '-'}
            tone={targetDiff == null ? undefined : Math.abs(targetDiff) < 0.5 ? 'success' : undefined}
          />
          <Stat
            label="週間変化"
            value={weeklyChange != null ? `${weeklyChange > 0 ? '+' : ''}${weeklyChange}kg` : '-'}
          />
        </View>
        {target != null ? <Text style={styles.hint}>目標体重: {target.toFixed(1)}kg（設定画面で変更できます）</Text> : null}
      </Card>

      {/* グラフ */}
      <BarChart title="体重推移" points={asc.map((log) => ({ label: log.date.slice(5), value: log.weight_kg }))} unit="kg" color={colors.primary} baseline="min" maxBars={21} />
      <BarChart title="7日移動平均" points={asc.map((log) => ({ label: log.date.slice(5), value: log.moving_average_7d }))} unit="kg" color={colors.carbs} baseline="min" maxBars={21} />

      {/* 履歴 */}
      <SectionTitle>履歴</SectionTitle>
      {logs.length === 0 ? <EmptyState icon="scale-outline" message="まだ記録がありません" /> : null}
      {logs.slice(0, 21).map((log) => (
        <View key={log.id} style={styles.logRow}>
          <Text style={styles.logDate}>{log.date}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={styles.logValue}>{log.weight_kg.toFixed(1)}kg</Text>
            <Badge label={`7日平均 ${log.moving_average_7d.toFixed(1)}`} tone="neutral" />
            <Pressable
              onPress={() => confirmDelete(`${log.date} の体重記録`, async () => {
                await softDelete('body_weight_logs', log.id);
                await load();
                refresh();
              })}
              hitSlop={6}
            >
              <Ionicons name="trash-outline" size={17} color={colors.faint} />
            </Pressable>
          </View>
        </View>
      ))}
    </Screen>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tone === 'success' && { color: colors.success }]}>{value}</Text>
    </View>
  );
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000));
}

const styles = StyleSheet.create({
  rowGap: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 11, fontWeight: '800', color: colors.sub },
  statValue: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 4 },
  hint: { color: colors.faint, fontSize: 12, marginTop: 12, textAlign: 'center' },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 },
  logDate: { color: colors.sub, fontWeight: '700', fontSize: 13 },
  logValue: { color: colors.ink, fontWeight: '800', fontSize: 15 }
});

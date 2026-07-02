import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Badge, Button, Card, Chip, Field, ProgressBar, Stepper } from '../components/ui';
import {
  addBodyWeightLog,
  addGymLocation,
  finishWorkoutSession,
  getActiveWorkoutSession,
  getBodyWeights,
  getDailyNutrition,
  getGymLocations,
  getLastGymLocationId,
  getProfile,
  getWeekWorkoutCount,
  startWorkoutSession,
  type GymLocationRow
} from '../db/client';
import { colors } from '../theme';
import type { DailyNutritionSummary, UserProfile, WorkoutSession } from '../types';
import { timeHM } from '../utils/date';
import type { Tab } from '../navigation';

export function HomeScreen({
  go,
  refreshKey,
  refresh
}: {
  go: (tab: Tab) => void;
  refreshKey: number;
  refresh: () => void;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [nutrition, setNutrition] = useState<DailyNutritionSummary | null>(null);
  const [active, setActive] = useState<WorkoutSession | null>(null);
  const [weekCount, setWeekCount] = useState(0);
  const [weight, setWeight] = useState('');
  const [lastWeight, setLastWeight] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState('');
  const [gyms, setGyms] = useState<GymLocationRow[]>([]);
  const [selectedGymId, setSelectedGymId] = useState<string | null>(null);
  const [gymFormOpen, setGymFormOpen] = useState(false);
  const [newGymName, setNewGymName] = useState('');

  const load = useCallback(async () => {
    const [p, n, a, c, weights, gymList, lastGym] = await Promise.all([
      getProfile(),
      getDailyNutrition(),
      getActiveWorkoutSession(),
      getWeekWorkoutCount(),
      getBodyWeights(1),
      getGymLocations(),
      getLastGymLocationId()
    ]);
    setProfile(p);
    setNutrition(n);
    setActive(a);
    setWeekCount(c);
    setLastWeight(weights[0]?.weight_kg ?? null);
    setGyms(gymList);
    // 前回使った店舗をデフォルト選択にして1タップで開始できるようにする（初回は明示的に選ばせる）
    setSelectedGymId((prev) => prev ?? lastGym);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // ジム滞在中の経過時間を1分ごとに更新
  useEffect(() => {
    if (!active?.started_at) {
      setElapsed('');
      return;
    }
    const update = () => {
      const minutes = Math.max(0, Math.floor((Date.now() - new Date(active.started_at as string).getTime()) / 60000));
      setElapsed(`${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`);
    };
    update();
    const timer = setInterval(update, 30000);
    return () => clearInterval(timer);
  }, [active]);

  async function handleEnterGym() {
    // 店舗の選択は必須（マシン記録・店舗別比較の基盤になるため）
    if (!selectedGymId) {
      Alert.alert('店舗を選択してください', 'どのジムでのワークアウトかを選んでから開始します。');
      return;
    }
    await startWorkoutSession(selectedGymId);
    await load();
    refresh();
  }

  async function saveGym() {
    if (!newGymName.trim()) return;
    const id = await addGymLocation(newGymName.trim());
    setNewGymName('');
    setGymFormOpen(false);
    setSelectedGymId(id);
    await load();
  }

  async function handleLeaveGym() {
    if (!active) return;
    await finishWorkoutSession(active.id);
    await load();
    refresh();
  }

  async function saveWeight() {
    // 未編集ならステッパーに表示中の前回値をそのまま保存できるようにする
    const value = Number(weight || (lastWeight != null ? lastWeight.toFixed(1) : ''));
    if (!value || value <= 0) return;
    await addBodyWeightLog(value);
    setWeight('');
    await load();
    refresh();
  }

  const remainKcal = profile && nutrition ? profile.daily_calorie_target - nutrition.calories : null;
  const activeGymName = active?.gym_location_id ? gyms.find((g) => g.id === active.gym_location_id)?.name ?? null : null;

  return (
    <Screen
      title="今日"
      subtitle={new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
      right={
        <Pressable onPress={() => go('settings')} style={styles.gearButton} hitSlop={8}>
          <Ionicons name="settings-outline" size={22} color={colors.sub} />
        </Pressable>
      }
    >
      {/* 今日の栄養 */}
      <Card>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>今日の食事</Text>
          {remainKcal != null ? (
            <Badge
              label={remainKcal >= 0 ? `残り ${remainKcal} kcal` : `${-remainKcal} kcal オーバー`}
              tone={remainKcal >= 0 ? 'primary' : 'danger'}
            />
          ) : null}
        </View>
        <ProgressBar label="カロリー" current={nutrition?.calories ?? 0} target={profile?.daily_calorie_target ?? 0} color={colors.kcal} unit="kcal" />
        <ProgressBar label="Protein" current={Math.round((nutrition?.protein ?? 0) * 10) / 10} target={profile?.protein_target_g ?? 0} color={colors.protein} unit="g" missingCount={nutrition?.missingProtein} />
        <ProgressBar label="Fat" current={Math.round((nutrition?.fat ?? 0) * 10) / 10} target={profile?.fat_target_g ?? 0} color={colors.fat} unit="g" missingCount={nutrition?.missingFat} />
        <ProgressBar label="Carbs" current={Math.round((nutrition?.carbs ?? 0) * 10) / 10} target={profile?.carbs_target_g ?? 0} color={colors.carbs} unit="g" missingCount={nutrition?.missingCarbs} />
        <Button label="Add Meal" icon="add-circle-outline" variant="secondary" onPress={() => go('meal')} style={{ marginTop: 14 }} />
      </Card>

      {/* ジム */}
      <Card>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>ワークアウト</Text>
          <Badge label={`今週 ${weekCount} 回`} tone="neutral" />
        </View>
        {active ? (
          <>
            <View style={styles.activeRow}>
              <View style={styles.pulseDot} />
              <Text style={styles.activeText}>
                Started {timeHM(active.started_at)} ・ {elapsed} elapsed
                {activeGymName ? ` ・ ${activeGymName}` : ''}
              </Text>
            </View>
            <Button label="Finish Workout" icon="stop-circle-outline" size="lg" onPress={handleLeaveGym} style={{ marginTop: 12 }} />
            <Button label="Log Sets" icon="barbell-outline" variant="secondary" onPress={() => go('workout')} style={{ marginTop: 8 }} />
          </>
        ) : (
          <>
            {/* 入った店舗を選んでからワンタップで開始（店舗は必須） */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
              {gyms.map((gym) => (
                <Chip key={gym.id} label={gym.name} selected={selectedGymId === gym.id} onPress={() => setSelectedGymId(gym.id)} />
              ))}
              <Chip label="+ ジム追加" onPress={() => setGymFormOpen((open) => !open)} />
            </ScrollView>
            {gymFormOpen ? (
              <View style={styles.rowGap}>
                <Field value={newGymName} onChangeText={setNewGymName} placeholder="例: Anytime Fitness 上野" flex />
                <Button label="登録" size="sm" onPress={saveGym} />
              </View>
            ) : null}
            <Button label="Start Workout" icon="play-circle-outline" size="lg" onPress={handleEnterGym} disabled={!selectedGymId} style={{ marginTop: 10 }} />
            <View style={styles.rowGap}>
              <Button label="Log Workout" icon="barbell-outline" variant="secondary" onPress={() => go('workout')} style={{ flex: 1 }} />
              <Button label="Edit Time" icon="time-outline" variant="ghost" onPress={() => go('workout')} style={{ flex: 1 }} />
            </View>
          </>
        )}
      </Card>

      {/* 体重 */}
      <Card>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>今日の体重</Text>
          {lastWeight != null ? <Badge label={`前回 ${lastWeight.toFixed(1)} kg`} tone="neutral" /> : null}
        </View>
        <View style={styles.rowGap}>
          <Stepper label="kg" value={weight || (lastWeight != null ? lastWeight.toFixed(1) : '')} onChange={setWeight} step={0.1} decimals={1} />
          <Button label="Save" icon="checkmark" onPress={saveWeight} style={{ alignSelf: 'flex-end', minWidth: 92 }} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gearButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  pulseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  activeText: { color: colors.sub, fontWeight: '700' },
  rowGap: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'flex-end' }
});

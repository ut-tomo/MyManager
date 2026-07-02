import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { BarChart, HBarList } from '../components/charts';
import { Badge, Button, Card, Chip, EmptyState, Field, Segmented, SectionTitle, Stepper, confirmDelete } from '../components/ui';
import {
  addSameWeightBlock,
  addWorkoutExercise,
  addWorkoutSet,
  finishWorkoutSession,
  getActiveWorkoutSession,
  getExerciseCharts,
  getExerciseHistory,
  getExercises,
  getGymLocations,
  getLastPerformance,
  getMuscleVolumeThisWeek,
  getRecentSessions,
  getSetBlocks,
  getWeeklyFrequency,
  getWorkoutExercises,
  getWorkoutSets,
  softDelete,
  startWorkoutSession,
  toggleTopSet,
  updateSessionMeta,
  updateSessionTimes,
  type GymLocationRow,
  type SetBlockSummary
} from '../db/client';
import { colors } from '../theme';
import type { Exercise, ExerciseHistoryItem, WorkoutExercise, WorkoutSession, WorkoutSet } from '../types';
import { combineDateTime, timeHM } from '../utils/date';

const OUTCOME_LABEL: Record<string, string> = {
  completed: '成功',
  failed: '潰れた',
  easy: '余力あり',
  stopped_before_failure: '手前で終了',
  assisted: '補助あり'
};

const MUSCLE_LABEL: Record<string, string> = {
  chest: '胸', back: '背中', legs: '脚', shoulders: '肩', arms: '腕', core: '体幹', other: 'その他'
};

type InputState = { weight: string; reps: string; step: number; blockSets: string };

export function WorkoutScreen({ refresh, refreshKey }: { refresh: () => void; refreshKey: number }) {
  const [view, setView] = useState<'log' | 'analysis'>('log');
  return (
    <Screen title="筋トレ">
      <Segmented
        value={view}
        options={[
          { value: 'log', label: '記録' },
          { value: 'analysis', label: '分析' }
        ]}
        onChange={setView}
      />
      {view === 'log' ? <LogView refresh={refresh} refreshKey={refreshKey} /> : <AnalysisView />}
    </Screen>
  );
}

// ---- 記録ビュー ----
function LogView({ refresh, refreshKey }: { refresh: () => void; refreshKey: number }) {
  const [active, setActive] = useState<WorkoutSession | null>(null);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [gyms, setGyms] = useState<GymLocationRow[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<{ exercise: Exercise; history: ExerciseHistoryItem[] } | null>(null);
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>([]);
  const [setsByExercise, setSetsByExercise] = useState<Record<string, WorkoutSet[]>>({});
  const [blocksByExercise, setBlocksByExercise] = useState<Record<string, SetBlockSummary[]>>({});
  const [inputs, setInputs] = useState<Record<string, InputState>>({});
  const [timeEditOpen, setTimeEditOpen] = useState(false);
  const [startHM, setStartHM] = useState('');
  const [endHM, setEndHM] = useState('');
  const [durationText, setDurationText] = useState('');

  const load = useCallback(async () => {
    const a = await getActiveWorkoutSession();
    setActive(a);
    setSessions(await getRecentSessions(5));
    setGyms(await getGymLocations());
    if (a) {
      const wes = await getWorkoutExercises(a.id);
      setWorkoutExercises(wes);
      const setEntries = await Promise.all(wes.map(async (we) => [we.id, await getWorkoutSets(we.id)] as const));
      setSetsByExercise(Object.fromEntries(setEntries));
      const blockEntries = await Promise.all(wes.map(async (we) => [we.id, await getSetBlocks(we.id)] as const));
      setBlocksByExercise(Object.fromEntries(blockEntries));
    } else {
      setWorkoutExercises([]);
      setSetsByExercise({});
      setBlocksByExercise({});
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    getExercises(query).then(setExercises);
  }, [query]);

  function getInput(weId: string): InputState {
    return inputs[weId] ?? { weight: '60', reps: '5', step: 2.5, blockSets: '3' };
  }

  function setInput(weId: string, patch: Partial<InputState>) {
    setInputs((prev) => ({ ...prev, [weId]: { ...getInput(weId), ...patch } }));
  }

  async function ensureSession(): Promise<string> {
    if (active) return active.id;
    const id = await startWorkoutSession();
    await load();
    refresh();
    return id;
  }

  async function showPreview(exercise: Exercise) {
    setPreview({ exercise, history: await getExerciseHistory(exercise.id, 30) });
  }

  async function addToSession(exercise: Exercise) {
    const sessionId = await ensureSession();
    const weId = await addWorkoutExercise(sessionId, exercise.id);
    // 前回の重量・回数をプレフィルして入力を高速化
    const last = await getLastPerformance(exercise.id);
    if (last) {
      setInputs((prev) => ({ ...prev, [weId]: { weight: String(last.weight), reps: String(last.reps), step: 2.5, blockSets: '3' } }));
    }
    setPreview(null);
    setQuery('');
    await load();
  }

  async function quickSet(we: WorkoutExercise, outcome: WorkoutSet['outcome']) {
    const input = getInput(we.id);
    const weight = Number(input.weight);
    const reps = Number(input.reps);
    if (!Number.isFinite(weight) || !Number.isFinite(reps) || reps <= 0) return;
    await addWorkoutSet({ workoutExerciseId: we.id, weight, reps, outcome });
    await load();
  }

  async function addBlock(we: WorkoutExercise, label: '5x5' | 'same_weight_sets') {
    const input = getInput(we.id);
    const weight = Number(input.weight);
    if (!Number.isFinite(weight)) return;
    if (label === '5x5') {
      await addSameWeightBlock({ workoutExerciseId: we.id, label: '5x5', weight, reps: 5, sets: 5 });
    } else {
      const sets = Math.max(1, Math.min(10, Number(input.blockSets) || 3));
      const reps = Math.max(1, Number(input.reps) || 5);
      await addSameWeightBlock({ workoutExerciseId: we.id, label: 'same_weight_sets', weight, reps, sets });
    }
    await load();
  }

  async function saveTimes() {
    if (!active) return;
    const started = startHM ? combineDateTime(active.date, startHM) : null;
    const ended = endHM ? combineDateTime(active.date, endHM) : null;
    if (startHM && !started) {
      Alert.alert('入力エラー', '開始時刻は HH:MM 形式で入力してください');
      return;
    }
    if (endHM && !ended) {
      Alert.alert('入力エラー', '終了時刻は HH:MM 形式で入力してください');
      return;
    }
    const duration = durationText ? Number(durationText) : undefined;
    await updateSessionTimes(active.id, {
      started_at: startHM ? started : undefined,
      ended_at: endHM ? ended : undefined,
      duration_minutes: duration !== undefined && Number.isFinite(duration) ? duration : undefined
    });
    setTimeEditOpen(false);
    await load();
    refresh();
  }

  return (
    <View>
      {/* セッションカード */}
      <Card>
        {active ? (
          <>
            <View style={styles.sessionHeader}>
              <View style={styles.activeRow}>
                <View style={styles.pulseDot} />
                <Text style={styles.sessionTitle}>セッション進行中</Text>
              </View>
              <Badge label={active.sync_status === 'synced' ? '同期済み' : '未同期'} tone={active.sync_status === 'synced' ? 'success' : 'warn'} />
            </View>
            <Text style={styles.sessionMeta}>
              {active.date} ・ {timeHM(active.started_at) || '--:--'} 〜 {timeHM(active.ended_at) || '進行中'}
            </Text>
            {/* ジム店舗選択 */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
              {gyms.map((gym) => (
                <Chip
                  key={gym.id}
                  label={gym.name}
                  selected={active.gym_location_id === gym.id}
                  onPress={async () => {
                    await updateSessionMeta(active.id, { gym_location_id: active.gym_location_id === gym.id ? null : gym.id });
                    await load();
                  }}
                />
              ))}
            </ScrollView>
            <View style={styles.rowGap}>
              <Button
                label="ジムを出た"
                icon="exit-outline"
                onPress={async () => {
                  await finishWorkoutSession(active.id);
                  await load();
                  refresh();
                }}
                style={{ flex: 1 }}
              />
              <Button label="時間を編集" icon="time-outline" variant="ghost" onPress={() => {
                setStartHM(timeHM(active.started_at));
                setEndHM(timeHM(active.ended_at));
                setDurationText(active.duration_minutes != null ? String(active.duration_minutes) : '');
                setTimeEditOpen((open) => !open);
              }} style={{ flex: 1 }} />
            </View>
            {timeEditOpen ? (
              <View>
                <View style={styles.rowGap}>
                  <Field label="開始 (HH:MM)" value={startHM} onChangeText={setStartHM} placeholder="18:30" flex />
                  <Field label="終了 (HH:MM)" value={endHM} onChangeText={setEndHM} placeholder="20:00" flex />
                  <Field label="時間(分)" value={durationText} onChangeText={setDurationText} placeholder="90" keyboardType="number-pad" flex />
                </View>
                <Button label="時間を保存" size="sm" onPress={saveTimes} style={{ marginTop: 10 }} />
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.sessionTitle}>今日のセッション</Text>
            <Button label="ジムに入った（セッション開始）" icon="enter-outline" size="lg" onPress={ensureSession} style={{ marginTop: 12 }} />
            <Text style={styles.hint}>押し忘れても後から時間を編集できます</Text>
          </>
        )}
      </Card>

      {/* 種目検索 */}
      <SectionTitle>種目を追加</SectionTitle>
      <Field value={query} onChangeText={setQuery} placeholder="種目を検索（例: ベンチ）" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
        {exercises.map((exercise) => (
          <Chip
            key={exercise.id}
            label={exercise.name}
            sub={MUSCLE_LABEL[exercise.muscle_group] ?? exercise.muscle_group}
            selected={preview?.exercise.id === exercise.id}
            onPress={() => showPreview(exercise)}
          />
        ))}
      </ScrollView>

      {/* 直近1ヶ月プレビュー */}
      {preview ? (
        <Card>
          <View style={styles.sessionHeader}>
            <Text style={styles.sessionTitle}>{preview.exercise.name} ・ 直近1ヶ月</Text>
            <Pressable onPress={() => setPreview(null)} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.faint} />
            </Pressable>
          </View>
          {preview.history.length === 0 ? (
            <Text style={styles.hint}>この1ヶ月の記録はありません</Text>
          ) : (
            preview.history.slice(0, 4).map((item) => (
              <Text key={item.date} style={styles.historyLine}>
                {item.date}　{item.summary}
              </Text>
            ))
          )}
          <Button label="今日のセッションに追加" icon="add" onPress={() => addToSession(preview.exercise)} style={{ marginTop: 12 }} />
        </Card>
      ) : null}

      {/* 今日の種目とセット入力 */}
      {workoutExercises.map((we) => {
        const input = getInput(we.id);
        const sets = setsByExercise[we.id] ?? [];
        const blocks = blocksByExercise[we.id] ?? [];
        return (
          <Card key={we.id}>
            <View style={styles.sessionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Text style={styles.exerciseName} numberOfLines={1}>{we.exercise_name}</Text>
                <Badge label={MUSCLE_LABEL[we.muscle_group ?? 'other'] ?? '他'} tone="neutral" />
              </View>
              <Pressable
                onPress={() => confirmDelete(`${we.exercise_name} と今日のセット`, async () => {
                  await softDelete('workout_exercises', we.id);
                  await load();
                })}
                hitSlop={8}
              >
                <Ionicons name="trash-outline" size={19} color={colors.faint} />
              </Pressable>
            </View>

            {/* 重量・回数入力 */}
            <View style={styles.rowGap}>
              <Stepper label={`重量 kg（±${input.step}）`} value={input.weight} onChange={(v) => setInput(we.id, { weight: v })} step={input.step} />
              <Stepper label="回数" value={input.reps} onChange={(v) => setInput(we.id, { reps: v })} step={1} decimals={0} min={1} />
            </View>
            <View style={styles.stepToggleRow}>
              <Text style={styles.hint}>刻み:</Text>
              {[2.5, 1].map((step) => (
                <Pressable key={step} onPress={() => setInput(we.id, { step })} style={[styles.stepToggle, input.step === step && styles.stepToggleActive]}>
                  <Text style={[styles.stepToggleText, input.step === step && styles.stepToggleTextActive]}>{step}kg</Text>
                </Pressable>
              ))}
            </View>

            {/* 結果ボタン */}
            <View style={styles.outcomeRow}>
              <Button label="成功" size="sm" onPress={() => quickSet(we, 'completed')} style={{ flex: 1 }} />
              <Button label="潰れた" size="sm" variant="danger" onPress={() => quickSet(we, 'failed')} style={{ flex: 1 }} />
              <Button label="余力あり" size="sm" variant="secondary" onPress={() => quickSet(we, 'easy')} style={{ flex: 1 }} />
            </View>
            <View style={styles.outcomeRow}>
              <Button label="5x5 を追加" size="sm" variant="ghost" icon="grid-outline" onPress={() => addBlock(we, '5x5')} style={{ flex: 1.2 }} />
              <Button label={`同重量×${input.blockSets || 3}`} size="sm" variant="ghost" icon="copy-outline" onPress={() => addBlock(we, 'same_weight_sets')} style={{ flex: 1.2 }} />
              <Stepper label="" value={input.blockSets} onChange={(v) => setInput(we.id, { blockSets: v })} step={1} decimals={0} min={1} />
            </View>

            {/* SetBlock達成状況 */}
            {blocks.map((block) => (
              <View key={block.id} style={styles.blockRow}>
                <Text style={styles.blockText}>
                  {block.label === 'same_weight_sets' ? `同重量 ${block.target_sets}セット` : block.label}
                  {block.target_weight ? ` ${block.target_weight}kg×${block.target_reps}` : ''}　{block.achieved_count}/{block.target_sets ?? block.set_count}
                </Text>
                <Badge
                  label={block.achievement === 'completed' ? '完遂' : block.achievement === 'partial' ? '一部未達' : block.achievement === 'failed' ? '失敗' : '-'}
                  tone={block.achievement === 'completed' ? 'success' : block.achievement === 'partial' ? 'warn' : block.achievement === 'failed' ? 'danger' : 'neutral'}
                />
              </View>
            ))}

            {/* セット一覧 */}
            {sets.map((set) => (
              <View key={set.id} style={styles.setRow}>
                <Text style={styles.setText}>
                  {set.order_index + 1}. <Text style={{ fontWeight: '800' }}>{set.weight}kg × {set.reps}</Text>
                  <Text style={styles.setSub}>  e1RM {set.estimated_1rm}</Text>
                </Text>
                <View style={styles.setActions}>
                  <Badge
                    label={OUTCOME_LABEL[set.outcome] ?? set.outcome}
                    tone={set.outcome === 'failed' ? 'danger' : set.outcome === 'easy' ? 'primary' : 'neutral'}
                  />
                  <Pressable onPress={async () => { await toggleTopSet(we.id, set.id); await load(); }} hitSlop={6}>
                    <Ionicons name={set.is_selected_top_set ? 'star' : 'star-outline'} size={20} color={set.is_selected_top_set ? '#F59E0B' : colors.faint} />
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDelete(`セット ${set.weight}kg × ${set.reps}`, async () => {
                      await softDelete('workout_sets', set.id);
                      await load();
                    })}
                    hitSlop={6}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.faint} />
                  </Pressable>
                </View>
              </View>
            ))}
            {sets.length === 0 ? <Text style={styles.hint}>★でトップセットを選択できます</Text> : null}
          </Card>
        );
      })}

      {active && workoutExercises.length === 0 ? (
        <EmptyState icon="barbell-outline" message="上の検索から種目を追加してください" />
      ) : null}

      {/* 最近のセッション */}
      <SectionTitle>最近のセッション</SectionTitle>
      {sessions.length === 0 ? <EmptyState icon="calendar-outline" message="まだセッションがありません" /> : null}
      {sessions.map((session) => (
        <View key={session.id} style={styles.recentRow}>
          <Text style={styles.recentText}>
            {session.date}　{session.duration_minutes != null ? `${session.duration_minutes}分` : '-'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Badge label={session.sync_status === 'synced' ? '同期済み' : '未同期'} tone={session.sync_status === 'synced' ? 'success' : 'warn'} />
            <Pressable
              onPress={() => confirmDelete(`${session.date} のセッション`, async () => {
                await softDelete('workout_sessions', session.id);
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
    </View>
  );
}

// ---- 分析ビュー（種目詳細） ----
function AnalysisView() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [gyms, setGyms] = useState<GymLocationRow[]>([]);
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [gymFilter, setGymFilter] = useState<string | null>(null);
  const [history, setHistory] = useState<ExerciseHistoryItem[]>([]);
  const [chart, setChart] = useState<Array<{ date: string; top_weight: number; top_reps: number; estimated_1rm: number; volume: number }>>([]);
  const [frequency, setFrequency] = useState<Array<{ week_start: string; count: number }>>([]);
  const [muscleVolume, setMuscleVolume] = useState<Array<{ muscle_group: string; volume: number }>>([]);

  useEffect(() => {
    getExercises().then((list) => {
      setExercises(list);
      if (list.length > 0) setSelected((prev) => prev ?? list[0]);
    });
    getGymLocations().then(setGyms);
    getWeeklyFrequency(8).then(setFrequency);
    getMuscleVolumeThisWeek().then(setMuscleVolume);
  }, []);

  useEffect(() => {
    if (!selected) return;
    getExerciseHistory(selected.id, 90, gymFilter).then(setHistory);
    getExerciseCharts(selected.id, gymFilter).then(setChart);
  }, [selected, gymFilter]);

  const chartPoints = (key: 'top_weight' | 'estimated_1rm' | 'volume') =>
    chart.map((item) => ({ label: item.date.slice(5), value: item[key] }));

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
        {exercises.map((exercise) => (
          <Chip key={exercise.id} label={exercise.name} selected={selected?.id === exercise.id} onPress={() => setSelected(exercise)} />
        ))}
      </ScrollView>

      {/* 店舗フィルタ */}
      {gyms.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          <Chip label="全店舗" selected={gymFilter === null} onPress={() => setGymFilter(null)} />
          {gyms.map((gym) => (
            <Chip key={gym.id} label={gym.name} selected={gymFilter === gym.id} onPress={() => setGymFilter(gym.id)} />
          ))}
        </ScrollView>
      ) : null}

      {selected ? (
        <>
          <BarChart title="トップセット重量" points={chartPoints('top_weight')} unit="kg" color={colors.primary} baseline="min" />
          <BarChart title="推定1RM (Epley)" points={chartPoints('estimated_1rm')} unit="kg" color={colors.carbs} baseline="min" />
          <BarChart title="総重量（volume）" points={chartPoints('volume')} unit="kg" color={colors.fat} />
          <SectionTitle>直近ログ</SectionTitle>
          {history.length === 0 ? <EmptyState icon="analytics-outline" message="この条件の記録はありません" /> : null}
          {history.slice(0, 10).map((item) => (
            <View key={item.date} style={styles.recentRow}>
              <Text style={styles.recentText}>{item.date}</Text>
              <Text style={styles.recentText}>{item.summary}</Text>
            </View>
          ))}
        </>
      ) : (
        <EmptyState icon="analytics-outline" message="種目を選択してください" />
      )}

      <BarChart title="週ごとのトレーニング回数" points={frequency.map((f) => ({ label: f.week_start.slice(5), value: f.count }))} unit="回" color={colors.success} maxBars={8} />
      <HBarList
        title="今週の部位別ボリューム"
        points={muscleVolume.map((m) => ({ label: MUSCLE_LABEL[m.muscle_group] ?? m.muscle_group, value: m.volume }))}
        unit="kg"
        color={colors.protein}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sessionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  sessionMeta: { color: colors.sub, marginTop: 6, fontWeight: '600' },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pulseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  rowGap: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'flex-end' },
  hint: { color: colors.faint, fontSize: 12, marginTop: 8 },
  historyLine: { color: colors.sub, marginTop: 6, fontSize: 13, fontWeight: '600' },
  exerciseName: { fontSize: 16, fontWeight: '800', color: colors.ink, flexShrink: 1 },
  stepToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  stepToggle: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#F1F3F6' },
  stepToggleActive: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primaryBorder },
  stepToggleText: { fontSize: 12, fontWeight: '700', color: colors.sub },
  stepToggleTextActive: { color: colors.primary },
  outcomeRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'flex-end' },
  blockRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, backgroundColor: '#F8FAFB', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  blockText: { fontSize: 13, fontWeight: '700', color: colors.sub, flexShrink: 1 },
  setRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 42, borderBottomWidth: 1, borderBottomColor: '#F1F3F6' },
  setText: { color: colors.ink, fontSize: 14 },
  setSub: { color: colors.faint, fontSize: 12 },
  setActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 },
  recentText: { color: colors.sub, fontWeight: '600', fontSize: 13 }
});

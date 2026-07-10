import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { BarChart, HBarList } from '../components/charts';
import { Badge, Button, Card, Chip, EmptyState, Field, Segmented, SectionTitle, Stepper, confirmDelete } from '../components/ui';
import {
  addEquipmentInstance,
  addGymLocation,
  addSameWeightBlock,
  addWorkoutExercise,
  addWorkoutSet,
  finishWorkoutSession,
  getActiveWorkoutSession,
  getEquipmentInstances,
  getExerciseCharts,
  getExerciseHistory,
  getExercises,
  getGymLocations,
  getLastEquipmentInstanceId,
  getLastGymLocationId,
  getLastPerformance,
  getMuscleVolumeThisWeek,
  getRecentSessions,
  getSetBlocks,
  getWeeklyFrequency,
  getWorkoutExercises,
  getWorkoutSets,
  setWorkoutExerciseEquipment,
  softDelete,
  startWorkoutSession,
  toggleTopSet,
  updateSessionMeta,
  updateSessionTimes,
  type EquipmentInstanceRow,
  type GymLocationRow,
  type SetBlockSummary
} from '../db/client';
import { cancelWorkoutCheckoutReminder, scheduleWorkoutCheckoutReminder } from '../services/notifications';
import { colors, radius } from '../theme';
import type { Exercise, ExerciseHistoryItem, WorkoutExercise, WorkoutSession, WorkoutSet } from '../types';
import { combineDateTime, timeHM } from '../utils/date';

const OUTCOME_LABEL: Record<string, string> = {
  completed: 'Done',
  failed: 'Failed',
  easy: 'Easy',
  stopped_before_failure: 'Stopped',
  assisted: '補助あり'
};

const MUSCLE_LABEL: Record<string, string> = {
  chest: '胸', back: '背中', legs: '脚', shoulders: '肩', arms: '腕', core: '体幹', other: 'その他'
};

// マシン個体の記録対象になる器具タイプ
function isMachineType(equipmentType?: string): boolean {
  return equipmentType === 'machine' || equipmentType === 'cable';
}

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
  const [selectedGymId, setSelectedGymId] = useState<string | null>(null);
  const [gymFormOpen, setGymFormOpen] = useState(false);
  const [newGymName, setNewGymName] = useState('');
  // マシン個体: 種目ID → セッション店舗のマシン一覧
  const [machinesByExercise, setMachinesByExercise] = useState<Record<string, EquipmentInstanceRow[]>>({});
  const [machineFormFor, setMachineFormFor] = useState<string | null>(null); // WorkoutExercise.id
  const [machineName, setMachineName] = useState('');
  const [timeEditOpen, setTimeEditOpen] = useState(false);
  const [startHM, setStartHM] = useState('');
  const [endHM, setEndHM] = useState('');
  const [durationText, setDurationText] = useState('');

  const load = useCallback(async () => {
    const a = await getActiveWorkoutSession();
    setActive(a);
    setSessions(await getRecentSessions(5));
    setGyms(await getGymLocations());
    // 前回使った店舗をデフォルト選択にする
    const lastGym = await getLastGymLocationId();
    setSelectedGymId((prev) => prev ?? lastGym);
    if (a) {
      const wes = await getWorkoutExercises(a.id);
      setWorkoutExercises(wes);
      const setEntries = await Promise.all(wes.map(async (we) => [we.id, await getWorkoutSets(we.id)] as const));
      setSetsByExercise(Object.fromEntries(setEntries));
      const blockEntries = await Promise.all(wes.map(async (we) => [we.id, await getSetBlocks(we.id)] as const));
      setBlocksByExercise(Object.fromEntries(blockEntries));
      // セッション店舗のマシン一覧（マシン種目のみ）
      if (a.gym_location_id) {
        const machineExercises = wes.filter((we) => isMachineType(we.equipment_type));
        const uniqueIds = [...new Set(machineExercises.map((we) => we.exercise_id))];
        const machineEntries = await Promise.all(
          uniqueIds.map(async (exId) => [exId, await getEquipmentInstances(exId, a.gym_location_id)] as const)
        );
        setMachinesByExercise(Object.fromEntries(machineEntries));
      } else {
        setMachinesByExercise({});
      }
    } else {
      setWorkoutExercises([]);
      setSetsByExercise({});
      setBlocksByExercise({});
      setMachinesByExercise({});
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

  // 店舗未選択ではセッションを開始しない（マシン記録・店舗別比較の基盤になるため必須）
  async function ensureSession(): Promise<string | null> {
    if (active) return active.id;
    if (!selectedGymId) {
      Alert.alert('店舗を選択してください', 'どのジムでのワークアウトかを選んでから開始します。');
      return null;
    }
    const id = await startWorkoutSession(selectedGymId);
    // 終了ボタンの押し忘れ対策: 3時間後にリマインド（権限がなければ静かに無視）
    scheduleWorkoutCheckoutReminder().catch(() => null);
    await load();
    refresh();
    return id;
  }

  async function saveGym() {
    if (!newGymName.trim()) return;
    const id = await addGymLocation(newGymName.trim());
    setNewGymName('');
    setGymFormOpen(false);
    setSelectedGymId(id);
    await load();
  }

  async function showPreview(exercise: Exercise) {
    setPreview({ exercise, history: await getExerciseHistory(exercise.id, 30) });
  }

  async function addToSession(exercise: Exercise) {
    const sessionId = await ensureSession();
    if (!sessionId) return;
    const weId = await addWorkoutExercise(sessionId, exercise.id);
    // 前回の重量・回数をプレフィルして入力を高速化
    const last = await getLastPerformance(exercise.id);
    if (last) {
      setInputs((prev) => ({ ...prev, [weId]: { weight: String(last.weight), reps: String(last.reps), step: 2.5, blockSets: '3' } }));
    }
    // マシン種目は、同じ店舗で前回使ったマシン（なければ唯一のマシン）を自動選択
    const session = await getActiveWorkoutSession();
    if (isMachineType(exercise.equipment_type) && session?.gym_location_id) {
      const lastMachine = await getLastEquipmentInstanceId(exercise.id, session.gym_location_id);
      if (lastMachine) {
        await setWorkoutExerciseEquipment(weId, lastMachine);
      } else {
        const instances = await getEquipmentInstances(exercise.id, session.gym_location_id);
        if (instances.length === 1) await setWorkoutExerciseEquipment(weId, instances[0].id);
      }
    }
    setPreview(null);
    setQuery('');
    await load();
  }

  async function saveMachine(we: WorkoutExercise) {
    if (!machineName.trim() || !active?.gym_location_id) return;
    const id = await addEquipmentInstance({
      exerciseId: we.exercise_id,
      gymLocationId: active.gym_location_id,
      displayName: machineName.trim()
    });
    await setWorkoutExerciseEquipment(we.id, id);
    setMachineName('');
    setMachineFormFor(null);
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
    // 終了時刻を手入力した場合もリマインドは不要になる
    if (endHM) cancelWorkoutCheckoutReminder().catch(() => null);
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
                <Text style={styles.sessionTitle}>Workout in progress</Text>
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
                label="Finish Workout"
                icon="stop-circle-outline"
                onPress={async () => {
                  await finishWorkoutSession(active.id);
                  cancelWorkoutCheckoutReminder().catch(() => null);
                  await load();
                  refresh();
                }}
                style={{ flex: 1 }}
              />
              <Button label="Edit Time" icon="time-outline" variant="ghost" onPress={() => {
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
                <Button label="Save Time" size="sm" onPress={saveTimes} style={{ marginTop: 10 }} />
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.sessionTitle}>今日のワークアウト</Text>
            <Text style={styles.hint}>入った店舗を選んで開始してください（必須）</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
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
            <Button label="Start Workout" icon="play-circle-outline" size="lg" onPress={ensureSession} disabled={!selectedGymId} style={{ marginTop: 12 }} />
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
          <Button label="Add to Workout" icon="add" onPress={() => addToSession(preview.exercise)} style={{ marginTop: 12 }} />
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

            {/* マシン選択（マシン・ケーブル種目のみ） */}
            {isMachineType(we.equipment_type) ? (
              active?.gym_location_id ? (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                    {(machinesByExercise[we.exercise_id] ?? []).map((machine) => (
                      <Chip
                        key={machine.id}
                        label={machine.display_name}
                        selected={we.equipment_instance_id === machine.id}
                        onPress={async () => {
                          await setWorkoutExerciseEquipment(we.id, we.equipment_instance_id === machine.id ? null : machine.id);
                          await load();
                        }}
                      />
                    ))}
                    <Chip
                      label="+ マシン追加"
                      onPress={() => {
                        setMachineFormFor(machineFormFor === we.id ? null : we.id);
                        setMachineName('');
                      }}
                    />
                  </ScrollView>
                  {machineFormFor === we.id ? (
                    <View style={styles.rowGap}>
                      <Field value={machineName} onChangeText={setMachineName} placeholder="例: ハンマー系ラットプル 左奥" flex />
                      <Button label="登録" size="sm" onPress={() => saveMachine(we)} />
                    </View>
                  ) : null}
                </>
              ) : (
                <Text style={styles.hint}>セッションの店舗を選択するとマシンを記録できます</Text>
              )
            ) : null}

            {/* 重量・回数入力 */}
            <View style={styles.rowGap}>
              <Stepper label={`kg ±${input.step}`} value={input.weight} onChange={(v) => setInput(we.id, { weight: v })} step={input.step} />
              <Stepper label="回" value={input.reps} onChange={(v) => setInput(we.id, { reps: v })} step={1} decimals={0} min={1} />
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
              <Button label="Done" size="sm" onPress={() => quickSet(we, 'completed')} style={{ flex: 1 }} />
              <Button label="Failed" size="sm" variant="danger" onPress={() => quickSet(we, 'failed')} style={{ flex: 1 }} />
              <Button label="Easy" size="sm" variant="secondary" onPress={() => quickSet(we, 'easy')} style={{ flex: 1 }} />
            </View>
            <View style={styles.outcomeRow}>
              <Button label="5x5" size="sm" variant="ghost" onPress={() => addBlock(we, '5x5')} style={{ flex: 1 }} />
              <Button label={`同重量×${input.blockSets || 3}`} size="sm" variant="ghost" onPress={() => addBlock(we, 'same_weight_sets')} style={{ flex: 1.4 }} />
              {/* セット数のコンパクトカウンター（Stepperだと幅がはみ出すため） */}
              <View style={styles.counter}>
                <Pressable
                  style={styles.counterButton}
                  onPress={() => setInput(we.id, { blockSets: String(Math.max(1, (Number(input.blockSets) || 3) - 1)) })}
                >
                  <Ionicons name="remove" size={16} color={colors.primary} />
                </Pressable>
                <Text style={styles.counterText}>{input.blockSets || '3'}</Text>
                <Pressable
                  style={styles.counterButton}
                  onPress={() => setInput(we.id, { blockSets: String(Math.min(10, (Number(input.blockSets) || 3) + 1)) })}
                >
                  <Ionicons name="add" size={16} color={colors.primary} />
                </Pressable>
              </View>
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
                    <Ionicons name={set.is_selected_top_set ? 'star' : 'star-outline'} size={20} color={set.is_selected_top_set ? colors.brass : colors.faint} />
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
type ChartItem = { date: string; top_weight: number; top_reps: number; estimated_1rm: number; volume: number; gyms: string[]; machines: string[] };

function AnalysisView() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [history, setHistory] = useState<ExerciseHistoryItem[]>([]);
  const [chart, setChart] = useState<ChartItem[]>([]);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [machines, setMachines] = useState<EquipmentInstanceRow[]>([]);
  const [machineFilter, setMachineFilter] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<Array<{ week_start: string; count: number }>>([]);
  const [muscleVolume, setMuscleVolume] = useState<Array<{ muscle_group: string; volume: number }>>([]);

  useEffect(() => {
    getExercises().then((list) => {
      setExercises(list);
      if (list.length > 0) setSelected((prev) => prev ?? list[0]);
    });
    getWeeklyFrequency(8).then(setFrequency);
    getMuscleVolumeThisWeek().then(setMuscleVolume);
  }, []);

  useEffect(() => {
    if (!selected) return;
    setMachineFilter(null);
    if (isMachineType(selected.equipment_type)) {
      getEquipmentInstances(selected.id).then(setMachines);
    } else {
      setMachines([]);
    }
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    setDetailIndex(null);
    // 基本は店舗に関わらず一律で表示（店舗差はポイント長押しで確認）。
    // マシン種目はマシン個体で絞り込める。
    getExerciseHistory(selected.id, 90, null, machineFilter).then(setHistory);
    getExerciseCharts(selected.id, null, machineFilter).then(setChart);
  }, [selected, machineFilter]);

  const chartPoints = (key: 'top_weight' | 'estimated_1rm' | 'volume') =>
    chart.map((item) => ({ label: item.date.slice(5), value: item[key] }));

  const detail = detailIndex != null ? chart[detailIndex] ?? null : null;

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
        {exercises.map((exercise) => (
          <Chip key={exercise.id} label={exercise.name} selected={selected?.id === exercise.id} onPress={() => setSelected(exercise)} />
        ))}
      </ScrollView>

      {/* マシン個体フィルタ（マシン・ケーブル種目のみ） */}
      {machines.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          <Chip label="全マシン" selected={machineFilter === null} onPress={() => setMachineFilter(null)} />
          {machines.map((machine) => (
            <Chip
              key={machine.id}
              label={machine.display_name}
              sub={machine.gym_name}
              selected={machineFilter === machine.id}
              onPress={() => setMachineFilter(machine.id)}
            />
          ))}
        </ScrollView>
      ) : null}

      {selected ? (
        <>
          <Text style={styles.hint}>グラフのバーを長押しすると、その日の詳細と店舗・マシンが確認できます</Text>
          <BarChart title="トップセット重量" points={chartPoints('top_weight')} unit="kg" color={colors.primary} baseline="min" onBarLongPress={setDetailIndex} selectedIndex={detailIndex} />
          <BarChart title="推定1RM (Epley)" points={chartPoints('estimated_1rm')} unit="kg" color={colors.carbs} baseline="min" onBarLongPress={setDetailIndex} selectedIndex={detailIndex} />
          <BarChart title="総重量（volume）" points={chartPoints('volume')} unit="kg" color={colors.fat} onBarLongPress={setDetailIndex} selectedIndex={detailIndex} />

          {/* 長押しで選択したポイントの詳細 */}
          {detail ? (
            <Card>
              <View style={styles.sessionHeader}>
                <Text style={styles.sessionTitle}>{detail.date}</Text>
                <Pressable onPress={() => setDetailIndex(null)} hitSlop={8}>
                  <Ionicons name="close" size={18} color={colors.faint} />
                </Pressable>
              </View>
              <Text style={styles.detailLine}>
                トップセット <Text style={styles.detailStrong}>{detail.top_weight}kg × {detail.top_reps}</Text>
                　e1RM <Text style={styles.detailStrong}>{detail.estimated_1rm}kg</Text>
                　総重量 <Text style={styles.detailStrong}>{detail.volume.toLocaleString()}kg</Text>
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <Ionicons name="location-outline" size={15} color={colors.brass} />
                <Text style={styles.detailGym}>{detail.gyms.length > 0 ? detail.gyms.join(' / ') : '店舗記録なし'}</Text>
              </View>
              {detail.machines.length > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <Ionicons name="cog-outline" size={15} color={colors.brass} />
                  <Text style={styles.detailGym}>{detail.machines.join(' / ')}</Text>
                </View>
              ) : null}
            </Card>
          ) : null}

          <SectionTitle>直近ログ</SectionTitle>
          {history.length === 0 ? <EmptyState icon="analytics-outline" message="まだ記録がありません" /> : null}
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
  stepToggle: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#23262E' },
  stepToggleActive: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primaryBorder },
  stepToggleText: { fontSize: 12, fontWeight: '700', color: colors.sub },
  stepToggleTextActive: { color: colors.primary },
  outcomeRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
  counter: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1D23', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 2 },
  counterButton: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  counterText: { width: 26, textAlign: 'center', color: colors.ink, fontWeight: '800', fontSize: 15 },
  blockRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, backgroundColor: '#1A1D23', borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8 },
  blockText: { fontSize: 13, fontWeight: '700', color: colors.sub, flexShrink: 1 },
  setRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 42, borderBottomWidth: 1, borderBottomColor: '#23262E' },
  setText: { color: colors.ink, fontSize: 14 },
  setSub: { color: colors.faint, fontSize: 12 },
  setActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 },
  recentText: { color: colors.sub, fontWeight: '600', fontSize: 13 },
  detailLine: { color: colors.sub, marginTop: 10, fontSize: 13, lineHeight: 20 },
  detailStrong: { color: colors.ink, fontWeight: '800', fontSize: 14 },
  detailGym: { color: colors.brass, fontWeight: '800', fontSize: 13 }
});

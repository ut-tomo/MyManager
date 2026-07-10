import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Badge, Button, Card, Chip, EmptyState, Field, Segmented, confirmDelete } from '../components/ui';
import {
  addGymLocation,
  createExercise,
  getExercises,
  getGymLocations,
  getProfile,
  softDelete,
  updateExercise,
  updateProfile,
  type GymLocationRow
} from '../db/client';
import { getLastSyncAt, getPendingSyncCount, syncNow } from '../services/sync';
import { supabase } from '../services/supabase';
import { colors } from '../theme';
import type { EquipmentType, Exercise, GoalType, UserProfile } from '../types';

type Section = 'exercise' | 'gym' | 'goal' | 'sync';

const MUSCLE_OPTIONS = [
  { value: 'chest', label: '胸' },
  { value: 'back', label: '背中' },
  { value: 'legs', label: '脚' },
  { value: 'shoulders', label: '肩' },
  { value: 'arms', label: '腕' },
  { value: 'core', label: '体幹' },
  { value: 'other', label: '他' }
];

const EQUIPMENT_OPTIONS: Array<{ value: EquipmentType; label: string }> = [
  { value: 'barbell', label: 'バーベル' },
  { value: 'dumbbell', label: 'ダンベル' },
  { value: 'machine', label: 'マシン' },
  { value: 'cable', label: 'ケーブル' },
  { value: 'bodyweight', label: '自重' },
  { value: 'other', label: 'その他' }
];

// equipment_type から load_input_mode と volume_multiplier を自動決定
function loadModeFor(equipment: EquipmentType): { mode: Exercise['load_input_mode']; multiplier: number } {
  switch (equipment) {
    case 'dumbbell':
      return { mode: 'per_hand_load', multiplier: 2 };
    case 'machine':
    case 'cable':
      return { mode: 'machine_stack', multiplier: 1 };
    case 'bodyweight':
      return { mode: 'bodyweight', multiplier: 0 };
    default:
      return { mode: 'total_load', multiplier: 1 };
  }
}

export function ManageScreen({ refresh }: { refresh: () => void }) {
  const [section, setSection] = useState<Section>('exercise');
  return (
    <Screen title="設定・管理" subtitle="種目・店舗・目標・同期（食材は食事タブから）">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
        {(
          [
            { value: 'exercise', label: '種目' },
            { value: 'gym', label: 'ジム店舗' },
            { value: 'goal', label: '目標' },
            { value: 'sync', label: '同期' }
          ] as Array<{ value: Section; label: string }>
        ).map((item) => (
          <Chip key={item.value} label={item.label} selected={section === item.value} onPress={() => setSection(item.value)} />
        ))}
      </ScrollView>
      {section === 'exercise' ? <ExerciseSection refresh={refresh} /> : null}
      {section === 'gym' ? <GymSection /> : null}
      {section === 'goal' ? <GoalSection refresh={refresh} /> : null}
      {section === 'sync' ? <SyncSection /> : null}
    </Screen>
  );
}

// ---- 種目 ----
function ExerciseSection({ refresh }: { refresh: () => void }) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState('chest');
  const [equipment, setEquipment] = useState<EquipmentType>('barbell');

  const load = useCallback(() => getExercises().then(setExercises), []);
  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!name.trim()) return;
    const { mode, multiplier } = loadModeFor(equipment);
    const input = { name: name.trim(), muscle_group: muscle, equipment_type: equipment, load_input_mode: mode, volume_multiplier: multiplier };
    if (editing) {
      await updateExercise(editing.id, input);
    } else {
      await createExercise(input);
    }
    setName('');
    setEditing(null);
    await load();
    refresh();
  }

  return (
    <>
      <Card>
        <Text style={styles.cardTitle}>{editing ? `「${editing.name}」を編集` : '種目を追加'}</Text>
        <Field label="種目名" value={name} onChangeText={setName} placeholder="例: インクラインベンチプレス" />
        <Text style={styles.fieldLabel}>部位</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {MUSCLE_OPTIONS.map((option) => (
            <Chip key={option.value} label={option.label} selected={muscle === option.value} onPress={() => setMuscle(option.value)} />
          ))}
        </ScrollView>
        <Text style={styles.fieldLabel}>器具（総重量の計算方法が自動設定されます）</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {EQUIPMENT_OPTIONS.map((option) => (
            <Chip key={option.value} label={option.label} selected={equipment === option.value} onPress={() => setEquipment(option.value)} />
          ))}
        </ScrollView>
        {equipment === 'dumbbell' ? <Text style={styles.hint}>ダンベル種目は片手の重量で入力します（総重量は2倍で計算）</Text> : null}
        <View style={styles.rowGap}>
          {editing ? (
            <Button label="キャンセル" variant="ghost" onPress={() => { setEditing(null); setName(''); }} style={{ flex: 1 }} />
          ) : null}
          <Button label={editing ? '更新する' : '追加する'} icon="checkmark" onPress={save} style={{ flex: 2 }} />
        </View>
      </Card>
      {exercises.map((exercise) => (
        <ListRow
          key={exercise.id}
          title={exercise.name}
          subtitle={`${MUSCLE_OPTIONS.find((m) => m.value === exercise.muscle_group)?.label ?? exercise.muscle_group} ・ ${EQUIPMENT_OPTIONS.find((e) => e.value === exercise.equipment_type)?.label ?? exercise.equipment_type}`}
          onEdit={() => {
            setEditing(exercise);
            setName(exercise.name);
            setMuscle(exercise.muscle_group);
            setEquipment(exercise.equipment_type);
          }}
          onDelete={() => confirmDelete(exercise.name, async () => {
            await softDelete('exercises', exercise.id);
            await load();
            refresh();
          })}
        />
      ))}
    </>
  );
}

// ---- ジム店舗 ----
function GymSection() {
  const [gyms, setGyms] = useState<GymLocationRow[]>([]);
  const [name, setName] = useState('');

  const load = useCallback(() => getGymLocations().then(setGyms), []);
  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!name.trim()) return;
    await addGymLocation(name.trim());
    setName('');
    await load();
  }

  return (
    <>
      <Card>
        <Text style={styles.cardTitle}>ジム店舗を追加</Text>
        <Text style={styles.hint}>店舗を登録すると、マシンの重さ設定が違う店舗間でも記録を分けて比較できます</Text>
        <Field label="店舗名" value={name} onChangeText={setName} placeholder="例: Anytime Fitness 上野" />
        <Button label="追加する" icon="checkmark" onPress={save} style={{ marginTop: 12 }} />
      </Card>
      {gyms.map((gym) => (
        <ListRow
          key={gym.id}
          title={gym.name}
          subtitle={gym.note ?? ''}
          onDelete={() => confirmDelete(gym.name, async () => {
            await softDelete('gym_locations', gym.id);
            await load();
          })}
        />
      ))}
    </>
  );
}

// ---- 目標 ----
function GoalSection({ refresh }: { refresh: () => void }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [targetWeight, setTargetWeight] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [carbs, setCarbs] = useState('');
  const [goal, setGoal] = useState<GoalType>('maintain');

  useEffect(() => {
    getProfile().then((p) => {
      setProfile(p);
      setGoal(p.goal_type);
      setTargetWeight(p.target_weight_kg != null ? String(p.target_weight_kg) : '');
      setKcal(String(p.daily_calorie_target));
      setProtein(String(p.protein_target_g));
      setFat(String(p.fat_target_g));
      setCarbs(String(p.carbs_target_g));
    });
  }, []);

  async function save() {
    if (!profile) return;
    await updateProfile({
      goal_type: goal,
      target_weight_kg: targetWeight ? Number(targetWeight) : null,
      daily_calorie_target: Math.round(Number(kcal)) || profile.daily_calorie_target,
      protein_target_g: Number(protein) || profile.protein_target_g,
      fat_target_g: Number(fat) || profile.fat_target_g,
      carbs_target_g: Number(carbs) || profile.carbs_target_g
    });
    Alert.alert('保存しました', '目標を更新しました');
    refresh();
  }

  return (
    <Card>
      <Text style={styles.cardTitle}>目標設定</Text>
      <Text style={styles.fieldLabel}>目的</Text>
      <Segmented
        value={goal}
        options={[
          { value: 'cut', label: '減量' },
          { value: 'bulk', label: '増量' },
          { value: 'maintain', label: '維持' },
          { value: 'recomposition', label: '再構成' }
        ]}
        onChange={setGoal}
      />
      <Field label="目標体重 (kg)" value={targetWeight} onChangeText={setTargetWeight} keyboardType="decimal-pad" placeholder="70.0" />
      <View style={styles.rowGap}>
        <Field label="目標kcal / 日" value={kcal} onChangeText={setKcal} keyboardType="number-pad" flex />
        <Field label="P (g)" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" flex />
        <Field label="F (g)" value={fat} onChangeText={setFat} keyboardType="decimal-pad" flex />
        <Field label="C (g)" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" flex />
      </View>
      <Button label="目標を保存" icon="checkmark" size="lg" onPress={save} style={{ marginTop: 14 }} />
    </Card>
  );
}

// ---- 同期 ----
function SyncSection() {
  const [pending, setPending] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPending(await getPendingSyncCount());
    setLastSyncAt(await getLastSyncAt());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function runSync() {
    setSyncing(true);
    setMessage('');
    try {
      const result = await syncNow();
      if (result.errors.length > 0) {
        setMessage(`エラー: ${result.errors[0].table} / ${result.errors[0].message}`);
      } else {
        setMessage(`${result.pushed} 件を同期しました`);
      }
      await load();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Card>
      <View style={styles.syncHeader}>
        <Text style={styles.cardTitle}>Supabase 同期</Text>
        <Badge label={supabase ? '接続設定あり' : '未設定'} tone={supabase ? 'success' : 'warn'} />
      </View>
      <Text style={styles.hint}>
        記録は常に端末内に即時保存されます。通信できるタイミングでクラウドへ同期してください。
      </Text>
      <View style={styles.syncStat}>
        <Text style={styles.syncCount}>{pending ?? '-'}</Text>
        <Text style={styles.hint}>未同期の記録</Text>
        {lastSyncAt ? (
          <Text style={styles.hint}>最終同期: {formatSyncTime(lastSyncAt)}</Text>
        ) : null}
      </View>
      <Button label={syncing ? '同期中…' : '今すぐ同期'} icon="cloud-upload-outline" size="lg" onPress={runSync} disabled={syncing || !supabase} />
      {!supabase ? (
        <Text style={styles.hint}>
          .env に EXPO_PUBLIC_SUPABASE_URL と EXPO_PUBLIC_SUPABASE_ANON_KEY を設定すると有効になります。
        </Text>
      ) : null}
      {message ? <Text style={[styles.hint, { marginTop: 10 }]}>{message}</Text> : null}
    </Card>
  );
}

function formatSyncTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---- 共通の行 ----
function ListRow({ title, subtitle, onEdit, onDelete }: { title: string; subtitle: string; onEdit?: () => void; onDelete: () => void }) {
  return (
    <View style={styles.listRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.listTitle}>{title}</Text>
        {subtitle ? <Text style={styles.listSub}>{subtitle}</Text> : null}
      </View>
      {onEdit ? (
        <Pressable onPress={onEdit} hitSlop={6}>
          <Ionicons name="pencil" size={18} color={colors.sub} />
        </Pressable>
      ) : null}
      <Pressable onPress={onDelete} hitSlop={6}>
        <Ionicons name="trash-outline" size={18} color={colors.faint} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  closeButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  fieldLabel: { fontSize: 12, fontWeight: '800', color: colors.sub, marginTop: 12, marginBottom: 6 },
  hint: { color: colors.faint, fontSize: 12, marginTop: 8, lineHeight: 17 },
  rowGap: { flexDirection: 'row', gap: 8, marginTop: 12 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, marginTop: 8 },
  listTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  listSub: { fontSize: 12, color: colors.sub, marginTop: 2 },
  ingredientRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 10 },
  autoTotals: { marginTop: 12, fontWeight: '800', color: colors.primary },
  syncHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  syncStat: { alignItems: 'center', marginVertical: 16 },
  syncCount: { fontSize: 36, fontWeight: '800', color: colors.ink }
});

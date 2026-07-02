import * as SQLite from 'expo-sqlite';
import { localSchema } from './schema';
import { nowISO, newId, todayISO, weekStartMondayISO, addDaysISO, epley1rm } from '../utils/date';
import type {
  BodyWeightLog,
  DailyNutritionSummary,
  Exercise,
  ExerciseHistoryItem,
  MealEntry,
  UserProfile,
  WorkoutExercise,
  WorkoutSession,
  WorkoutSet
} from '../types';

const db = SQLite.openDatabaseSync('my_manager.db');

type Row = Record<string, unknown>;

export async function initializeDatabase(): Promise<void> {
  await db.execAsync(localSchema);
  await seedDefaults();
}

async function seedDefaults(): Promise<void> {
  const profile = await db.getFirstAsync<Row>('SELECT id FROM user_profile LIMIT 1');
  const now = nowISO();
  if (!profile) {
    await db.runAsync(
      `INSERT INTO user_profile (id, height_cm, current_weight_kg, target_weight_kg, goal_type, daily_calorie_target, protein_target_g, fat_target_g, carbs_target_g, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['profile_local', 175, null, 70, 'maintain', 2300, 140, 65, 260, now, now]
    );
  }

  await seedGyms(now);

  const exerciseCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM exercises WHERE deleted_at IS NULL');
  if ((exerciseCount?.count ?? 0) > 0) return;

  const exercises: Array<Omit<Exercise, 'id'>> = [
    { name: 'ベンチプレス', muscle_group: 'chest', equipment_type: 'barbell', load_input_mode: 'total_load', volume_multiplier: 1 },
    { name: 'ダンベルベンチプレス', muscle_group: 'chest', equipment_type: 'dumbbell', load_input_mode: 'per_hand_load', volume_multiplier: 2 },
    { name: 'スクワット', muscle_group: 'legs', equipment_type: 'barbell', load_input_mode: 'total_load', volume_multiplier: 1 },
    { name: 'デッドリフト', muscle_group: 'back', equipment_type: 'barbell', load_input_mode: 'total_load', volume_multiplier: 1 },
    { name: 'ラットプルダウン', muscle_group: 'back', equipment_type: 'machine', load_input_mode: 'machine_stack', volume_multiplier: 1 },
    { name: 'ショルダープレス', muscle_group: 'shoulders', equipment_type: 'dumbbell', load_input_mode: 'per_hand_load', volume_multiplier: 2 },
    { name: 'レッグプレス', muscle_group: 'legs', equipment_type: 'machine', load_input_mode: 'machine_stack', volume_multiplier: 1 },
    { name: '懸垂', muscle_group: 'back', equipment_type: 'bodyweight', load_input_mode: 'bodyweight', volume_multiplier: 0 }
  ];

  for (const exercise of exercises) {
    await db.runAsync(
      `INSERT INTO exercises (id, name, muscle_group, equipment_type, load_input_mode, volume_multiplier, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId('ex'), exercise.name, exercise.muscle_group, exercise.equipment_type, exercise.load_input_mode, exercise.volume_multiplier, now, now]
    );
  }

}

// デフォルトのジム店舗。既存DBにも名前が無ければ追加する。
async function seedGyms(now: string): Promise<void> {
  const defaults = ['Anytime Fitness 秋葉原', 'Anytime Fitness 新御徒町', 'Anytime Fitness 御茶ノ水'];
  for (const name of defaults) {
    const existing = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM gym_locations WHERE name = ? AND deleted_at IS NULL LIMIT 1`,
      [name]
    );
    if (!existing) {
      await db.runAsync(
        `INSERT INTO gym_locations (id, name, note, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)`,
        [newId('gym'), name, now, now]
      );
    }
  }
  // 旧バージョンでシードした未編集のサンプル店舗は取り下げる
  await db.runAsync(
    `UPDATE gym_locations SET deleted_at = ?, updated_at = ? WHERE name = 'エニタイム湯島' AND note = '初期サンプル。編集または削除できます。' AND deleted_at IS NULL`,
    [now, now]
  );
}

export async function getProfile(): Promise<UserProfile> {
  const row = await db.getFirstAsync<UserProfile>('SELECT * FROM user_profile LIMIT 1');
  if (!row) throw new Error('User profile is missing');
  return row;
}

export async function updateProfile(input: Partial<UserProfile>): Promise<void> {
  const current = await getProfile();
  const next = { ...current, ...input };
  await db.runAsync(
    `UPDATE user_profile SET height_cm = ?, current_weight_kg = ?, target_weight_kg = ?, goal_type = ?, daily_calorie_target = ?,
     protein_target_g = ?, fat_target_g = ?, carbs_target_g = ?, sync_status = 'modified', updated_at = ? WHERE id = ?`,
    [
      next.height_cm ?? null,
      next.current_weight_kg ?? null,
      next.target_weight_kg ?? null,
      next.goal_type,
      next.daily_calorie_target,
      next.protein_target_g,
      next.fat_target_g,
      next.carbs_target_g,
      nowISO(),
      current.id
    ]
  );
}

export async function getExercises(query = ''): Promise<Exercise[]> {
  return db.getAllAsync<Exercise>(
    `SELECT * FROM exercises WHERE deleted_at IS NULL AND name LIKE ? ORDER BY name LIMIT 50`,
    [`%${query}%`]
  );
}

export async function createExercise(input: Omit<Exercise, 'id'>): Promise<string> {
  const id = newId('ex');
  const now = nowISO();
  await db.runAsync(
    `INSERT INTO exercises (id, name, muscle_group, equipment_type, load_input_mode, volume_multiplier, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.name, input.muscle_group, input.equipment_type, input.load_input_mode, input.volume_multiplier, input.note ?? null, now, now]
  );
  return id;
}

export async function startWorkoutSession(gymLocationId?: string | null): Promise<string> {
  const id = newId('ws');
  const now = nowISO();
  await db.runAsync(
    `INSERT INTO workout_sessions (id, date, gym_location_id, started_at, sync_status, created_at, updated_at) VALUES (?, ?, ?, ?, 'local_only', ?, ?)`,
    [id, todayISO(), gymLocationId ?? null, now, now, now]
  );
  return id;
}

// 前回のセッションで使った店舗（開始時のデフォルト選択に使う）
export async function getLastGymLocationId(): Promise<string | null> {
  const row = await db.getFirstAsync<{ gym_location_id: string | null }>(
    `SELECT gym_location_id FROM workout_sessions WHERE deleted_at IS NULL AND gym_location_id IS NOT NULL ORDER BY date DESC, created_at DESC LIMIT 1`
  );
  return row?.gym_location_id ?? null;
}

export async function getActiveWorkoutSession(): Promise<WorkoutSession | null> {
  return db.getFirstAsync<WorkoutSession>(
    `SELECT * FROM workout_sessions WHERE deleted_at IS NULL AND started_at IS NOT NULL AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`
  );
}

export async function finishWorkoutSession(id: string): Promise<void> {
  const session = await db.getFirstAsync<WorkoutSession>('SELECT * FROM workout_sessions WHERE id = ?', [id]);
  const ended = nowISO();
  const duration = session?.started_at ? Math.round((new Date(ended).getTime() - new Date(session.started_at).getTime()) / 60000) : null;
  await db.runAsync(
    `UPDATE workout_sessions SET ended_at = ?, duration_minutes = ?, sync_status = CASE WHEN sync_status = 'synced' THEN 'modified' ELSE sync_status END, updated_at = ? WHERE id = ?`,
    [ended, duration, ended, id]
  );
}

export async function getRecentSessions(limit = 10): Promise<WorkoutSession[]> {
  return db.getAllAsync<WorkoutSession>(
    `SELECT * FROM workout_sessions WHERE deleted_at IS NULL ORDER BY date DESC, COALESCE(started_at, created_at) DESC LIMIT ?`,
    [limit]
  );
}

export async function getWeekWorkoutCount(): Promise<number> {
  const start = weekStartMondayISO();
  const end = addDaysISO(start, 6);
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM workout_sessions WHERE deleted_at IS NULL AND date BETWEEN ? AND ?`,
    [start, end]
  );
  return row?.count ?? 0;
}

export async function addWorkoutExercise(sessionId: string, exerciseId: string): Promise<string> {
  const orderRow = await db.getFirstAsync<{ max_order: number }>(
    `SELECT MAX(order_index) as max_order FROM workout_exercises WHERE workout_session_id = ? AND deleted_at IS NULL`,
    [sessionId]
  );
  const id = newId('we');
  const now = nowISO();
  await db.runAsync(
    `INSERT INTO workout_exercises (id, workout_session_id, exercise_id, order_index, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, sessionId, exerciseId, (orderRow?.max_order ?? -1) + 1, now, now]
  );
  return id;
}

export async function getWorkoutExercises(sessionId: string): Promise<WorkoutExercise[]> {
  return db.getAllAsync<WorkoutExercise>(
    `SELECT we.*, e.name as exercise_name, e.muscle_group, e.volume_multiplier, e.equipment_type, ei.display_name as equipment_name
     FROM workout_exercises we
     JOIN exercises e ON e.id = we.exercise_id
     LEFT JOIN equipment_instances ei ON ei.id = we.equipment_instance_id
     WHERE we.workout_session_id = ? AND we.deleted_at IS NULL
     ORDER BY we.order_index`,
    [sessionId]
  );
}

export async function addWorkoutSet(input: {
  workoutExerciseId: string;
  weight: number;
  reps: number;
  outcome: WorkoutSet['outcome'];
  isTopSet?: boolean;
  setType?: WorkoutSet['set_type'];
  setBlockId?: string | null;
}): Promise<string> {
  const orderRow = await db.getFirstAsync<{ max_order: number }>(
    `SELECT MAX(order_index) as max_order FROM workout_sets WHERE workout_exercise_id = ? AND deleted_at IS NULL`,
    [input.workoutExerciseId]
  );
  const id = newId('set');
  const now = nowISO();
  if (input.isTopSet) {
    await db.runAsync(
      `UPDATE workout_sets SET is_selected_top_set = 0, sync_status = CASE WHEN sync_status = 'synced' THEN 'modified' ELSE sync_status END, updated_at = ? WHERE workout_exercise_id = ? AND is_selected_top_set = 1`,
      [now, input.workoutExerciseId]
    );
  }
  await db.runAsync(
    `INSERT INTO workout_sets (id, workout_exercise_id, set_block_id, order_index, weight, reps, set_type, outcome, is_selected_top_set, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.workoutExerciseId,
      input.setBlockId ?? null,
      (orderRow?.max_order ?? -1) + 1,
      input.weight,
      input.reps,
      input.setType ?? 'working',
      input.outcome,
      input.isTopSet ? 1 : 0,
      now,
      now
    ]
  );
  return id;
}

export async function createSetBlock(input: {
  workoutExerciseId: string;
  label: string;
  targetWeight?: number;
  targetReps?: number;
  targetSets?: number;
}): Promise<string> {
  const id = newId('block');
  const now = nowISO();
  await db.runAsync(
    `INSERT INTO set_blocks (id, workout_exercise_id, label, target_weight, target_reps, target_sets, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.workoutExerciseId, input.label, input.targetWeight ?? null, input.targetReps ?? null, input.targetSets ?? null, now, now]
  );
  return id;
}

export async function addSameWeightBlock(input: {
  workoutExerciseId: string;
  label: 'same_weight_sets' | '5x5';
  weight: number;
  reps: number;
  sets: number;
}): Promise<void> {
  const blockId = await createSetBlock({
    workoutExerciseId: input.workoutExerciseId,
    label: input.label,
    targetWeight: input.weight,
    targetReps: input.reps,
    targetSets: input.sets
  });
  for (let i = 0; i < input.sets; i += 1) {
    await addWorkoutSet({
      workoutExerciseId: input.workoutExerciseId,
      setBlockId: blockId,
      weight: input.weight,
      reps: input.reps,
      outcome: 'completed',
      setType: 'working'
    });
  }
}

export async function getWorkoutSets(workoutExerciseId: string): Promise<WorkoutSet[]> {
  const rows = await db.getAllAsync<WorkoutSet>(
    `SELECT * FROM workout_sets WHERE workout_exercise_id = ? AND deleted_at IS NULL ORDER BY order_index`,
    [workoutExerciseId]
  );
  return rows.map((row) => ({ ...row, estimated_1rm: epley1rm(row.weight, row.reps) }));
}

// トップセットのトグル。既に選択済みのセットを渡すと解除する。
export async function toggleTopSet(workoutExerciseId: string, setId: string): Promise<void> {
  const now = nowISO();
  const current = await db.getFirstAsync<{ is_selected_top_set: number }>(
    `SELECT is_selected_top_set FROM workout_sets WHERE id = ?`,
    [setId]
  );
  await db.runAsync(
    `UPDATE workout_sets SET is_selected_top_set = 0, sync_status = CASE WHEN sync_status = 'synced' THEN 'modified' ELSE sync_status END, updated_at = ? WHERE workout_exercise_id = ? AND is_selected_top_set = 1`,
    [now, workoutExerciseId]
  );
  if (!current?.is_selected_top_set) {
    await db.runAsync(
      `UPDATE workout_sets SET is_selected_top_set = 1, set_type = 'top', sync_status = CASE WHEN sync_status = 'synced' THEN 'modified' ELSE sync_status END, updated_at = ? WHERE id = ?`,
      [now, setId]
    );
  }
}

export async function selectTopSet(workoutExerciseId: string, setId: string): Promise<void> {
  await toggleTopSet(workoutExerciseId, setId);
}

export async function softDelete(table: string, id: string): Promise<void> {
  const allowed = new Set([
    'workout_sessions',
    'workout_exercises',
    'set_blocks',
    'workout_sets',
    'meal_entries',
    'ingredients',
    'meal_templates',
    'body_weight_logs',
    'exercises',
    'gym_locations'
  ]);
  if (!allowed.has(table)) throw new Error(`Unsupported table: ${table}`);
  const now = nowISO();
  await db.runAsync(`UPDATE ${table} SET deleted_at = ?, sync_status = 'modified', updated_at = ? WHERE id = ?`, [now, now, id]);
}

export async function addMealEntry(input: Omit<MealEntry, 'id' | 'sync_status'>): Promise<string> {
  const id = newId('meal');
  const now = nowISO();
  await db.runAsync(
    `INSERT INTO meal_entries (id, date, meal_type, name, calories_kcal, protein_g, fat_g, carbs_g, input_type, confidence, source, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.date,
      input.meal_type,
      input.name,
      input.calories_kcal,
      input.protein_g ?? null,
      input.fat_g ?? null,
      input.carbs_g ?? null,
      input.input_type,
      input.confidence,
      input.source ?? null,
      input.note ?? null,
      now,
      now
    ]
  );
  return id;
}

export async function getMeals(date = todayISO()): Promise<MealEntry[]> {
  return db.getAllAsync<MealEntry>(
    `SELECT * FROM meal_entries WHERE deleted_at IS NULL AND date = ? ORDER BY created_at DESC`,
    [date]
  );
}

export type IngredientRow = {
  id: string;
  name: string;
  calories_per_100g: number;
  protein_per_100g: number;
  fat_per_100g: number;
  carbs_per_100g: number;
  default_unit: string;
  note?: string | null;
};

export async function getIngredients(): Promise<IngredientRow[]> {
  return db.getAllAsync<IngredientRow>(`SELECT * FROM ingredients WHERE deleted_at IS NULL ORDER BY name`);
}

export async function addIngredient(input: Omit<IngredientRow, 'id'>): Promise<string> {
  const id = newId('ing');
  const now = nowISO();
  await db.runAsync(
    `INSERT INTO ingredients (id, name, calories_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g, default_unit, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.calories_per_100g,
      input.protein_per_100g,
      input.fat_per_100g,
      input.carbs_per_100g,
      input.default_unit,
      input.note ?? null,
      now,
      now
    ]
  );
  return id;
}

export type MealTemplateRow = {
  id: string;
  name: string;
  default_calories_kcal: number;
  default_protein_g?: number | null;
  default_fat_g?: number | null;
  default_carbs_g?: number | null;
  note?: string | null;
};

export async function getMealTemplates(): Promise<MealTemplateRow[]> {
  return db.getAllAsync<MealTemplateRow>(`SELECT * FROM meal_templates WHERE deleted_at IS NULL ORDER BY name`);
}

export async function addMealTemplate(input: Omit<MealTemplateRow, 'id'>): Promise<string> {
  const id = newId('tmpl');
  const now = nowISO();
  await db.runAsync(
    `INSERT INTO meal_templates (id, name, default_calories_kcal, default_protein_g, default_fat_g, default_carbs_g, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.default_calories_kcal,
      input.default_protein_g ?? null,
      input.default_fat_g ?? null,
      input.default_carbs_g ?? null,
      input.note ?? null,
      now,
      now
    ]
  );
  return id;
}

// ---- テンプレートの材料リスト ----
export type TemplateIngredientRow = {
  id: string;
  meal_template_id: string;
  ingredient_id: string;
  amount_g: number;
  ingredient_name: string;
  calories_per_100g: number;
  protein_per_100g: number;
  fat_per_100g: number;
  carbs_per_100g: number;
};

export async function getTemplateIngredients(templateId: string): Promise<TemplateIngredientRow[]> {
  return db.getAllAsync<TemplateIngredientRow>(
    `SELECT ti.id, ti.meal_template_id, ti.ingredient_id, ti.amount_g,
            i.name as ingredient_name, i.calories_per_100g, i.protein_per_100g, i.fat_per_100g, i.carbs_per_100g
     FROM meal_template_ingredients ti
     JOIN ingredients i ON i.id = ti.ingredient_id
     WHERE ti.meal_template_id = ? AND ti.deleted_at IS NULL AND i.deleted_at IS NULL
     ORDER BY ti.created_at`,
    [templateId]
  );
}

// 材料リストを丸ごと置き換え、テンプレートのデフォルトkcal/PFCを材料から再計算して保存する
export async function setTemplateIngredients(
  templateId: string,
  rows: Array<{ ingredient: IngredientRow; grams: number }>
): Promise<void> {
  const now = nowISO();
  await db.runAsync(
    `UPDATE meal_template_ingredients SET deleted_at = ?, sync_status = 'modified', updated_at = ? WHERE meal_template_id = ? AND deleted_at IS NULL`,
    [now, now, templateId]
  );
  for (const row of rows) {
    await db.runAsync(
      `INSERT INTO meal_template_ingredients (id, meal_template_id, ingredient_id, amount_g, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newId('ti'), templateId, row.ingredient.id, row.grams, now, now]
    );
  }
  if (rows.length > 0) {
    const totals = rows.reduce(
      (sum, row) => ({
        kcal: sum.kcal + (row.ingredient.calories_per_100g * row.grams) / 100,
        protein: sum.protein + (row.ingredient.protein_per_100g * row.grams) / 100,
        fat: sum.fat + (row.ingredient.fat_per_100g * row.grams) / 100,
        carbs: sum.carbs + (row.ingredient.carbs_per_100g * row.grams) / 100
      }),
      { kcal: 0, protein: 0, fat: 0, carbs: 0 }
    );
    await db.runAsync(
      `UPDATE meal_templates SET default_calories_kcal = ?, default_protein_g = ?, default_fat_g = ?, default_carbs_g = ?,
       sync_status = CASE WHEN sync_status = 'synced' THEN 'modified' ELSE sync_status END, updated_at = ? WHERE id = ?`,
      [Math.round(totals.kcal), round1(totals.protein), round1(totals.fat), round1(totals.carbs), now, templateId]
    );
  }
}

export async function getDailyNutrition(date = todayISO()): Promise<DailyNutritionSummary> {
  const meals = await getMeals(date);
  return meals.reduce<DailyNutritionSummary>(
    (sum, meal) => ({
      calories: sum.calories + meal.calories_kcal,
      protein: sum.protein + (meal.protein_g ?? 0),
      fat: sum.fat + (meal.fat_g ?? 0),
      carbs: sum.carbs + (meal.carbs_g ?? 0),
      missingProtein: sum.missingProtein + (meal.protein_g == null ? 1 : 0),
      missingFat: sum.missingFat + (meal.fat_g == null ? 1 : 0),
      missingCarbs: sum.missingCarbs + (meal.carbs_g == null ? 1 : 0),
      roughMeals: sum.roughMeals + (meal.confidence === 'rough' ? 1 : 0)
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0, missingProtein: 0, missingFat: 0, missingCarbs: 0, roughMeals: 0 }
  );
}

export async function addBodyWeightLog(weightKg: number, date = todayISO(), note?: string): Promise<string> {
  const id = newId('bw');
  const now = nowISO();
  await db.runAsync(
    `INSERT INTO body_weight_logs (id, date, weight_kg, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, date, Math.round(weightKg * 10) / 10, note ?? null, now, now]
  );
  await updateProfile({ current_weight_kg: Math.round(weightKg * 10) / 10 });
  return id;
}

export async function getBodyWeights(limit = 30): Promise<Array<BodyWeightLog & { moving_average_7d: number }>> {
  const rows = await db.getAllAsync<BodyWeightLog>(
    `SELECT * FROM body_weight_logs WHERE deleted_at IS NULL ORDER BY date DESC LIMIT ?`,
    [limit]
  );
  const asc = [...rows].reverse();
  return asc.map((row, index) => {
    const window = asc.slice(Math.max(0, index - 6), index + 1);
    const avg = window.reduce((sum, item) => sum + item.weight_kg, 0) / window.length;
    return { ...row, moving_average_7d: Math.round(avg * 10) / 10 };
  }).reverse();
}

export async function getExerciseHistory(
  exerciseId: string,
  days = 30,
  gymLocationId?: string | null,
  equipmentInstanceId?: string | null
): Promise<ExerciseHistoryItem[]> {
  const since = addDaysISO(todayISO(), -days);
  const filters: string[] = [];
  const params: Array<string | number> = [exerciseId, since];
  if (gymLocationId) {
    filters.push('AND ws.gym_location_id = ?');
    params.push(gymLocationId);
  }
  if (equipmentInstanceId) {
    filters.push('AND we.equipment_instance_id = ?');
    params.push(equipmentInstanceId);
  }
  const rows = await db.getAllAsync<{
    date: string;
    exercise_name: string;
    weight: number;
    reps: number;
    is_selected_top_set: number;
    volume_multiplier: number;
    gym_name: string | null;
    machine_name: string | null;
  }>(
    `SELECT ws.date, e.name as exercise_name, s.weight, s.reps, s.is_selected_top_set, e.volume_multiplier,
            gl.name as gym_name, ei.display_name as machine_name
     FROM workout_sets s
     JOIN workout_exercises we ON we.id = s.workout_exercise_id
     JOIN workout_sessions ws ON ws.id = we.workout_session_id
     JOIN exercises e ON e.id = we.exercise_id
     LEFT JOIN gym_locations gl ON gl.id = ws.gym_location_id
     LEFT JOIN equipment_instances ei ON ei.id = we.equipment_instance_id
     WHERE e.id = ? AND ws.date >= ? AND s.deleted_at IS NULL AND we.deleted_at IS NULL AND ws.deleted_at IS NULL ${filters.join(' ')}
     ORDER BY ws.date DESC, s.order_index DESC`,
    params
  );
  const byDate = new Map<string, ExerciseHistoryItem>();
  for (const row of rows) {
    const current = byDate.get(row.date) ?? {
      date: row.date,
      exercise_name: row.exercise_name,
      summary: '',
      total_volume: 0,
      top_weight: null,
      top_reps: null,
      estimated_1rm: null,
      gyms: [],
      machines: []
    };
    current.total_volume += row.weight * row.reps * row.volume_multiplier;
    if (row.gym_name && !current.gyms.includes(row.gym_name)) current.gyms.push(row.gym_name);
    if (row.machine_name && !current.machines.includes(row.machine_name)) current.machines.push(row.machine_name);
    if (row.is_selected_top_set || current.top_weight == null || epley1rm(row.weight, row.reps) > (current.estimated_1rm ?? 0)) {
      current.top_weight = row.weight;
      current.top_reps = row.reps;
      current.estimated_1rm = epley1rm(row.weight, row.reps);
    }
    byDate.set(row.date, current);
  }
  return [...byDate.values()].map((item) => ({
    ...item,
    summary: item.top_weight ? `${item.top_weight}kg x ${item.top_reps} / volume ${Math.round(item.total_volume)}kg` : `volume ${Math.round(item.total_volume)}kg`
  }));
}

export async function getExerciseCharts(
  exerciseId: string,
  gymLocationId?: string | null,
  equipmentInstanceId?: string | null
): Promise<Array<{ date: string; top_weight: number; top_reps: number; estimated_1rm: number; volume: number; gyms: string[]; machines: string[] }>> {
  const history = await getExerciseHistory(exerciseId, 90, gymLocationId, equipmentInstanceId);
  return history.reverse().map((item) => ({
    date: item.date,
    top_weight: item.top_weight ?? 0,
    top_reps: item.top_reps ?? 0,
    estimated_1rm: item.estimated_1rm ?? 0,
    volume: Math.round(item.total_volume),
    gyms: item.gyms,
    machines: item.machines
  }));
}

export async function upsertWeeklyReflection(text: string): Promise<void> {
  const start = weekStartMondayISO();
  const end = addDaysISO(start, 6);
  const existing = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM weekly_reviews WHERE week_start_date = ? AND deleted_at IS NULL LIMIT 1`,
    [start]
  );
  const now = nowISO();
  if (existing) {
    await db.runAsync(
      `UPDATE weekly_reviews SET user_reflection_text = ?, status = 'draft', sync_status = CASE WHEN sync_status = 'synced' THEN 'modified' ELSE sync_status END, updated_at = ? WHERE id = ?`,
      [text, now, existing.id]
    );
    return;
  }
  await db.runAsync(
    `INSERT INTO weekly_reviews (id, week_start_date, week_end_date, status, user_reflection_text, created_at, updated_at)
     VALUES (?, ?, ?, 'draft', ?, ?, ?)`,
    [newId('review'), start, end, text, now, now]
  );
}

export async function getWeeklyReviews(): Promise<Array<{ id: string; week_start_date: string; week_end_date: string; status: string; generated_at?: string | null; user_reflection_text?: string | null; llm_output_json?: string | null }>> {
  return db.getAllAsync(
    `SELECT id, week_start_date, week_end_date, status, generated_at, user_reflection_text, llm_output_json
     FROM weekly_reviews WHERE deleted_at IS NULL ORDER BY week_start_date DESC LIMIT 20`
  );
}

export async function buildWeeklySummary() {
  const start = weekStartMondayISO();
  const end = addDaysISO(start, 6);
  const workouts = await db.getFirstAsync<{ sessions: number; duration: number }>(
    `SELECT COUNT(*) as sessions, COALESCE(SUM(duration_minutes), 0) as duration
     FROM workout_sessions WHERE deleted_at IS NULL AND date BETWEEN ? AND ?`,
    [start, end]
  );
  const nutritionRows = await db.getAllAsync<MealEntry>(
    `SELECT * FROM meal_entries WHERE deleted_at IS NULL AND date BETWEEN ? AND ?`,
    [start, end]
  );
  const weights = await db.getAllAsync<BodyWeightLog>(
    `SELECT * FROM body_weight_logs WHERE deleted_at IS NULL AND date BETWEEN ? AND ? ORDER BY date`,
    [start, end]
  );
  const profile = await getProfile();
  const nutrition = nutritionRows.reduce(
    (sum, meal) => ({
      calories: sum.calories + meal.calories_kcal,
      protein: sum.protein + (meal.protein_g ?? 0),
      fat: sum.fat + (meal.fat_g ?? 0),
      carbs: sum.carbs + (meal.carbs_g ?? 0),
      missingMacros: sum.missingMacros + (meal.protein_g == null || meal.fat_g == null || meal.carbs_g == null ? 1 : 0),
      roughMeals: sum.roughMeals + (meal.confidence === 'rough' ? 1 : 0)
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0, missingMacros: 0, roughMeals: 0 }
  );
  const loggedDays = new Set(nutritionRows.map((meal) => meal.date)).size || 1;
  return {
    profile,
    week: { start, end },
    workouts: { sessions: workouts?.sessions ?? 0, total_duration_minutes: workouts?.duration ?? 0 },
    nutrition: {
      logged_days: loggedDays,
      average_calories_kcal: Math.round(nutrition.calories / loggedDays),
      target_calories_kcal: profile.daily_calorie_target,
      average_protein_g_known_only: Math.round(nutrition.protein / loggedDays),
      target_protein_g: profile.protein_target_g,
      average_fat_g_known_only: Math.round(nutrition.fat / loggedDays),
      target_fat_g: profile.fat_target_g,
      average_carbs_g_known_only: Math.round(nutrition.carbs / loggedDays),
      target_carbs_g: profile.carbs_target_g,
      meals_with_missing_macros: nutrition.missingMacros,
      rough_estimate_meals: nutrition.roughMeals
    },
    bodyweight: {
      measurements: weights.length,
      average_kg: weights.length ? Math.round((weights.reduce((sum, w) => sum + w.weight_kg, 0) / weights.length) * 10) / 10 : null,
      weekly_change_kg: weights.length >= 2 ? Math.round((weights[weights.length - 1].weight_kg - weights[0].weight_kg) * 10) / 10 : null
    }
  };
}

// ---- 追加ユーティリティ ----

// synced の行だけ modified に落とすための共通式
const TOUCH = `sync_status = CASE WHEN sync_status = 'synced' THEN 'modified' ELSE sync_status END`;

// ジムに入った/出たの押し忘れ用: 時刻の手動編集
export async function updateSessionTimes(
  id: string,
  input: { started_at?: string | null; ended_at?: string | null; duration_minutes?: number | null }
): Promise<void> {
  const session = await db.getFirstAsync<WorkoutSession>('SELECT * FROM workout_sessions WHERE id = ?', [id]);
  if (!session) return;
  const started = input.started_at !== undefined ? input.started_at : session.started_at ?? null;
  const ended = input.ended_at !== undefined ? input.ended_at : session.ended_at ?? null;
  let duration = input.duration_minutes !== undefined ? input.duration_minutes : session.duration_minutes ?? null;
  // 両方あるときは自動計算を優先する
  if (started && ended && input.duration_minutes === undefined) {
    const diff = Math.round((new Date(ended).getTime() - new Date(started).getTime()) / 60000);
    duration = Number.isFinite(diff) && diff >= 0 ? diff : duration;
  }
  await db.runAsync(
    `UPDATE workout_sessions SET started_at = ?, ended_at = ?, duration_minutes = ?, ${TOUCH}, updated_at = ? WHERE id = ?`,
    [started, ended, duration, nowISO(), id]
  );
}

export async function updateSessionMeta(
  id: string,
  input: { session_label?: string | null; note?: string | null; gym_location_id?: string | null }
): Promise<void> {
  const session = await db.getFirstAsync<WorkoutSession>('SELECT * FROM workout_sessions WHERE id = ?', [id]);
  if (!session) return;
  await db.runAsync(
    `UPDATE workout_sessions SET session_label = ?, note = ?, gym_location_id = ?, ${TOUCH}, updated_at = ? WHERE id = ?`,
    [
      input.session_label !== undefined ? input.session_label : session.session_label ?? null,
      input.note !== undefined ? input.note : session.note ?? null,
      input.gym_location_id !== undefined ? input.gym_location_id : session.gym_location_id ?? null,
      nowISO(),
      id
    ]
  );
}

export async function updateWorkoutSet(
  id: string,
  input: { weight?: number; reps?: number; outcome?: WorkoutSet['outcome'] }
): Promise<void> {
  const row = await db.getFirstAsync<WorkoutSet>('SELECT * FROM workout_sets WHERE id = ?', [id]);
  if (!row) return;
  await db.runAsync(
    `UPDATE workout_sets SET weight = ?, reps = ?, outcome = ?, ${TOUCH}, updated_at = ? WHERE id = ?`,
    [input.weight ?? row.weight, input.reps ?? row.reps, input.outcome ?? row.outcome, nowISO(), id]
  );
}

export type GymLocationRow = { id: string; name: string; note?: string | null };

export async function getGymLocations(): Promise<GymLocationRow[]> {
  return db.getAllAsync<GymLocationRow>(`SELECT id, name, note FROM gym_locations WHERE deleted_at IS NULL ORDER BY name`);
}

export async function addGymLocation(name: string, note?: string): Promise<string> {
  const id = newId('gym');
  const now = nowISO();
  await db.runAsync(
    `INSERT INTO gym_locations (id, name, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [id, name, note ?? null, now, now]
  );
  return id;
}

// ---- マシン個体（EquipmentInstance）----
// 同じ種目でも店舗・マシンごとに重さの意味が変わるため、個体単位で記録・比較する。
export type EquipmentInstanceRow = {
  id: string;
  gym_location_id: string;
  exercise_id: string;
  display_name: string;
  brand?: string | null;
  note?: string | null;
  gym_name?: string;
};

export async function getEquipmentInstances(exerciseId: string, gymLocationId?: string | null): Promise<EquipmentInstanceRow[]> {
  const gymFilter = gymLocationId ? 'AND ei.gym_location_id = ?' : '';
  const params = gymLocationId ? [exerciseId, gymLocationId] : [exerciseId];
  return db.getAllAsync<EquipmentInstanceRow>(
    `SELECT ei.*, gl.name as gym_name
     FROM equipment_instances ei
     JOIN gym_locations gl ON gl.id = ei.gym_location_id
     WHERE ei.exercise_id = ? AND ei.deleted_at IS NULL AND gl.deleted_at IS NULL ${gymFilter}
     ORDER BY gl.name, ei.display_name`,
    params
  );
}

export async function addEquipmentInstance(input: {
  exerciseId: string;
  gymLocationId: string;
  displayName: string;
  brand?: string;
}): Promise<string> {
  const id = newId('eq');
  const now = nowISO();
  await db.runAsync(
    `INSERT INTO equipment_instances (id, gym_location_id, exercise_id, display_name, brand, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.gymLocationId, input.exerciseId, input.displayName, input.brand ?? null, now, now]
  );
  return id;
}

// 同じ店舗で前回使ったマシン（追加時の自動プレフィル用）
export async function getLastEquipmentInstanceId(exerciseId: string, gymLocationId: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ equipment_instance_id: string | null }>(
    `SELECT we.equipment_instance_id
     FROM workout_exercises we
     JOIN workout_sessions ws ON ws.id = we.workout_session_id
     WHERE we.exercise_id = ? AND ws.gym_location_id = ? AND we.equipment_instance_id IS NOT NULL
       AND we.deleted_at IS NULL AND ws.deleted_at IS NULL
     ORDER BY ws.date DESC, we.created_at DESC LIMIT 1`,
    [exerciseId, gymLocationId]
  );
  return row?.equipment_instance_id ?? null;
}

export async function setWorkoutExerciseEquipment(workoutExerciseId: string, equipmentInstanceId: string | null): Promise<void> {
  await db.runAsync(
    `UPDATE workout_exercises SET equipment_instance_id = ?, ${TOUCH}, updated_at = ? WHERE id = ?`,
    [equipmentInstanceId, nowISO(), workoutExerciseId]
  );
}

// SetBlock 一覧 + 達成状況 (completed / partial / failed)
export type SetBlockSummary = {
  id: string;
  workout_exercise_id: string;
  label: string;
  target_weight?: number | null;
  target_reps?: number | null;
  target_sets?: number | null;
  set_count: number;
  achieved_count: number;
  failed_count: number;
  achievement: 'completed' | 'partial' | 'failed' | 'empty';
};

export async function getSetBlocks(workoutExerciseId: string): Promise<SetBlockSummary[]> {
  const blocks = await db.getAllAsync<SetBlockSummary>(
    `SELECT * FROM set_blocks WHERE workout_exercise_id = ? AND deleted_at IS NULL ORDER BY created_at`,
    [workoutExerciseId]
  );
  const result: SetBlockSummary[] = [];
  for (const block of blocks) {
    const sets = await db.getAllAsync<WorkoutSet>(
      `SELECT * FROM workout_sets WHERE set_block_id = ? AND deleted_at IS NULL ORDER BY order_index`,
      [block.id]
    );
    const targetReps = block.target_reps ?? 0;
    const achieved = sets.filter((s) => s.outcome !== 'failed' && s.reps >= targetReps).length;
    const failed = sets.filter((s) => s.outcome === 'failed').length;
    let achievement: SetBlockSummary['achievement'] = 'empty';
    if (sets.length > 0) {
      if (failed > 0 && achieved === 0) achievement = 'failed';
      else if (achieved >= (block.target_sets ?? sets.length)) achievement = 'completed';
      else achievement = 'partial';
    }
    result.push({ ...block, set_count: sets.length, achieved_count: achieved, failed_count: failed, achievement });
  }
  return result;
}

// 前回のトレーニング内容（プレフィル用）
export async function getLastPerformance(exerciseId: string): Promise<{ weight: number; reps: number } | null> {
  return db.getFirstAsync<{ weight: number; reps: number }>(
    `SELECT s.weight, s.reps
     FROM workout_sets s
     JOIN workout_exercises we ON we.id = s.workout_exercise_id
     JOIN workout_sessions ws ON ws.id = we.workout_session_id
     WHERE we.exercise_id = ? AND s.deleted_at IS NULL AND we.deleted_at IS NULL AND ws.deleted_at IS NULL
     ORDER BY ws.date DESC, s.is_selected_top_set DESC, s.weight DESC LIMIT 1`,
    [exerciseId]
  );
}

// 最近の食事（名前でユニーク化してコピー元に使う）
export async function getRecentMealEntries(limit = 12): Promise<MealEntry[]> {
  return db.getAllAsync<MealEntry>(
    `SELECT * FROM meal_entries me WHERE deleted_at IS NULL
     AND created_at = (SELECT MAX(created_at) FROM meal_entries WHERE name = me.name AND deleted_at IS NULL)
     ORDER BY created_at DESC LIMIT ?`,
    [limit]
  );
}

export async function copyMealEntry(source: MealEntry, mealType: MealEntry['meal_type']): Promise<string> {
  return addMealEntry({
    date: todayISO(),
    meal_type: mealType,
    name: source.name,
    calories_kcal: source.calories_kcal,
    protein_g: source.protein_g ?? null,
    fat_g: source.fat_g ?? null,
    carbs_g: source.carbs_g ?? null,
    input_type: 'copied_from_recent',
    confidence: source.confidence,
    source: source.source ?? null,
    note: null
  });
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export async function applyMealTemplate(
  template: MealTemplateRow,
  mealType: MealEntry['meal_type'],
  multiplier: number
): Promise<string> {
  return addMealEntry({
    date: todayISO(),
    meal_type: mealType,
    name: multiplier === 1 ? template.name : `${template.name} x${multiplier}`,
    calories_kcal: Math.round(template.default_calories_kcal * multiplier),
    protein_g: template.default_protein_g == null ? null : round1(template.default_protein_g * multiplier),
    fat_g: template.default_fat_g == null ? null : round1(template.default_fat_g * multiplier),
    carbs_g: template.default_carbs_g == null ? null : round1(template.default_carbs_g * multiplier),
    input_type: 'template_based',
    confidence: 'estimated',
    source: null,
    note: null
  });
}

// 材料ベースの食事: 食材×グラムから合計を計算して保存
export async function addIngredientBasedMeal(
  name: string,
  mealType: MealEntry['meal_type'],
  rows: Array<{ ingredient: IngredientRow; grams: number }>
): Promise<string> {
  const totals = rows.reduce(
    (sum, row) => ({
      calories: sum.calories + (row.ingredient.calories_per_100g * row.grams) / 100,
      protein: sum.protein + (row.ingredient.protein_per_100g * row.grams) / 100,
      fat: sum.fat + (row.ingredient.fat_per_100g * row.grams) / 100,
      carbs: sum.carbs + (row.ingredient.carbs_per_100g * row.grams) / 100
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );
  const mealId = await addMealEntry({
    date: todayISO(),
    meal_type: mealType,
    name,
    calories_kcal: Math.round(totals.calories),
    protein_g: round1(totals.protein),
    fat_g: round1(totals.fat),
    carbs_g: round1(totals.carbs),
    input_type: 'ingredient_based',
    confidence: 'exact',
    source: null,
    note: null
  });
  const now = nowISO();
  for (const row of rows) {
    await db.runAsync(
      `INSERT INTO meal_ingredients (id, meal_entry_id, ingredient_id, amount_g, calories_kcal, protein_g, fat_g, carbs_g, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId('mi'),
        mealId,
        row.ingredient.id,
        row.grams,
        Math.round((row.ingredient.calories_per_100g * row.grams) / 100),
        round1((row.ingredient.protein_per_100g * row.grams) / 100),
        round1((row.ingredient.fat_per_100g * row.grams) / 100),
        round1((row.ingredient.carbs_per_100g * row.grams) / 100),
        now,
        now
      ]
    );
  }
  return mealId;
}

export async function updateIngredient(id: string, input: Omit<IngredientRow, 'id'>): Promise<void> {
  await db.runAsync(
    `UPDATE ingredients SET name = ?, calories_per_100g = ?, protein_per_100g = ?, fat_per_100g = ?, carbs_per_100g = ?, default_unit = ?, note = ?, ${TOUCH}, updated_at = ? WHERE id = ?`,
    [
      input.name,
      input.calories_per_100g,
      input.protein_per_100g,
      input.fat_per_100g,
      input.carbs_per_100g,
      input.default_unit,
      input.note ?? null,
      nowISO(),
      id
    ]
  );
}

export async function updateMealTemplate(id: string, input: Omit<MealTemplateRow, 'id'>): Promise<void> {
  await db.runAsync(
    `UPDATE meal_templates SET name = ?, default_calories_kcal = ?, default_protein_g = ?, default_fat_g = ?, default_carbs_g = ?, note = ?, ${TOUCH}, updated_at = ? WHERE id = ?`,
    [
      input.name,
      input.default_calories_kcal,
      input.default_protein_g ?? null,
      input.default_fat_g ?? null,
      input.default_carbs_g ?? null,
      input.note ?? null,
      nowISO(),
      id
    ]
  );
}

export async function updateMealEntry(
  id: string,
  input: Partial<Pick<MealEntry, 'name' | 'meal_type' | 'calories_kcal' | 'protein_g' | 'fat_g' | 'carbs_g' | 'confidence' | 'note'>>
): Promise<void> {
  const row = await db.getFirstAsync<MealEntry>('SELECT * FROM meal_entries WHERE id = ?', [id]);
  if (!row) return;
  await db.runAsync(
    `UPDATE meal_entries SET name = ?, meal_type = ?, calories_kcal = ?, protein_g = ?, fat_g = ?, carbs_g = ?, confidence = ?, note = ?, ${TOUCH}, updated_at = ? WHERE id = ?`,
    [
      input.name ?? row.name,
      input.meal_type ?? row.meal_type,
      input.calories_kcal ?? row.calories_kcal,
      input.protein_g !== undefined ? input.protein_g : row.protein_g ?? null,
      input.fat_g !== undefined ? input.fat_g : row.fat_g ?? null,
      input.carbs_g !== undefined ? input.carbs_g : row.carbs_g ?? null,
      input.confidence ?? row.confidence,
      input.note !== undefined ? input.note : row.note ?? null,
      nowISO(),
      id
    ]
  );
}

export async function updateExercise(id: string, input: Omit<Exercise, 'id'>): Promise<void> {
  await db.runAsync(
    `UPDATE exercises SET name = ?, muscle_group = ?, equipment_type = ?, load_input_mode = ?, volume_multiplier = ?, note = ?, ${TOUCH}, updated_at = ? WHERE id = ?`,
    [input.name, input.muscle_group, input.equipment_type, input.load_input_mode, input.volume_multiplier, input.note ?? null, nowISO(), id]
  );
}

// ---- 可視化用の集計 ----

// 週ごとのトレーニング回数（直近weeks週、古い順）
export async function getWeeklyFrequency(weeks = 8): Promise<Array<{ week_start: string; count: number }>> {
  const thisMonday = weekStartMondayISO();
  const result: Array<{ week_start: string; count: number }> = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = addDaysISO(thisMonday, -7 * i);
    const end = addDaysISO(start, 6);
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM workout_sessions WHERE deleted_at IS NULL AND date BETWEEN ? AND ?`,
      [start, end]
    );
    result.push({ week_start: start, count: row?.count ?? 0 });
  }
  return result;
}

// 今週の部位別ボリューム
export async function getMuscleVolumeThisWeek(): Promise<Array<{ muscle_group: string; volume: number }>> {
  const start = weekStartMondayISO();
  const end = addDaysISO(start, 6);
  return db.getAllAsync<{ muscle_group: string; volume: number }>(
    `SELECT e.muscle_group, ROUND(SUM(s.weight * s.reps * e.volume_multiplier)) as volume
     FROM workout_sets s
     JOIN workout_exercises we ON we.id = s.workout_exercise_id
     JOIN workout_sessions ws ON ws.id = we.workout_session_id
     JOIN exercises e ON e.id = we.exercise_id
     WHERE ws.date BETWEEN ? AND ? AND s.deleted_at IS NULL AND we.deleted_at IS NULL AND ws.deleted_at IS NULL
     GROUP BY e.muscle_group ORDER BY volume DESC`,
    [start, end]
  );
}

// 日別摂取カロリー（直近days日、古い順。未記録日は0）
export async function getDailyCalories(days = 14): Promise<Array<{ date: string; calories: number }>> {
  const today = todayISO();
  const since = addDaysISO(today, -(days - 1));
  const rows = await db.getAllAsync<{ date: string; calories: number }>(
    `SELECT date, SUM(calories_kcal) as calories FROM meal_entries
     WHERE deleted_at IS NULL AND date >= ? GROUP BY date`,
    [since]
  );
  const byDate = new Map(rows.map((row) => [row.date, row.calories]));
  const result: Array<{ date: string; calories: number }> = [];
  for (let i = 0; i < days; i += 1) {
    const date = addDaysISO(since, i);
    result.push({ date, calories: byDate.get(date) ?? 0 });
  }
  return result;
}

// 今週のWeeklyReview行（感想メモのプレフィル用）
export type WeeklyReviewRow = {
  id: string;
  week_start_date: string;
  week_end_date: string;
  status: string;
  generated_at?: string | null;
  user_reflection_text?: string | null;
  llm_output_json?: string | null;
};

export async function getCurrentWeekReview(): Promise<WeeklyReviewRow | null> {
  return db.getFirstAsync<WeeklyReviewRow>(
    `SELECT id, week_start_date, week_end_date, status, generated_at, user_reflection_text, llm_output_json
     FROM weekly_reviews WHERE week_start_date = ? AND deleted_at IS NULL LIMIT 1`,
    [weekStartMondayISO()]
  );
}

// Edge Functionで生成したレビューをローカルに保存
export async function saveGeneratedReview(review: Record<string, unknown>): Promise<void> {
  const now = nowISO();
  const existing = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM weekly_reviews WHERE week_start_date = ? AND deleted_at IS NULL LIMIT 1`,
    [String(review.week_start_date)]
  );
  const toJson = (value: unknown) => (value == null ? null : typeof value === 'string' ? value : JSON.stringify(value));
  if (existing) {
    await db.runAsync(
      `UPDATE weekly_reviews SET generated_at = ?, status = ?, llm_input_json = ?, llm_output_json = ?,
       workout_summary_json = ?, nutrition_summary_json = ?, bodyweight_summary_json = ?, sync_status = 'synced', updated_at = ? WHERE id = ?`,
      [
        String(review.generated_at ?? now),
        String(review.status ?? 'generated'),
        toJson(review.llm_input_json),
        toJson(review.llm_output_json),
        toJson(review.workout_summary_json),
        toJson(review.nutrition_summary_json),
        toJson(review.bodyweight_summary_json),
        now,
        existing.id
      ]
    );
    return;
  }
  await db.runAsync(
    `INSERT INTO weekly_reviews (id, week_start_date, week_end_date, generated_at, status, user_reflection_text,
     workout_summary_json, nutrition_summary_json, bodyweight_summary_json, llm_input_json, llm_output_json, sync_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?)`,
    [
      String(review.id ?? newId('review')),
      String(review.week_start_date),
      String(review.week_end_date),
      String(review.generated_at ?? now),
      String(review.status ?? 'generated'),
      review.user_reflection_text == null ? null : String(review.user_reflection_text),
      toJson(review.workout_summary_json),
      toJson(review.nutrition_summary_json),
      toJson(review.bodyweight_summary_json),
      toJson(review.llm_input_json),
      toJson(review.llm_output_json),
      now,
      now
    ]
  );
}

export { db };

export type SyncStatus = 'local_only' | 'synced' | 'modified' | 'conflict';

export type EquipmentType =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'cardio'
  | 'other';

export type LoadInputMode = 'total_load' | 'per_hand_load' | 'machine_stack' | 'bodyweight';
export type SetBlockLabel = 'free' | 'same_weight_sets' | '5x5' | 'top_set' | 'backoff' | 'volume_work' | 'pyramid' | 'other';
export type WorkoutSetType = 'warmup' | 'working' | 'backoff' | 'top' | 'test';
export type WorkoutOutcome = 'completed' | 'failed' | 'stopped_before_failure' | 'assisted' | 'easy';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other';
export type MealInputType = 'manual_estimate' | 'ingredient_based' | 'template_based' | 'copied_from_recent';
export type Confidence = 'exact' | 'estimated' | 'rough';
export type GoalType = 'cut' | 'bulk' | 'maintain' | 'recomposition';

export type Exercise = {
  id: string;
  name: string;
  muscle_group: string;
  equipment_type: EquipmentType;
  load_input_mode: LoadInputMode;
  volume_multiplier: number;
  note?: string | null;
};

export type WorkoutSession = {
  id: string;
  date: string;
  gym_location_id?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_minutes?: number | null;
  session_label?: string | null;
  note?: string | null;
  sync_status: SyncStatus;
};

export type WorkoutExercise = {
  id: string;
  workout_session_id: string;
  exercise_id: string;
  equipment_instance_id?: string | null;
  order_index: number;
  note?: string | null;
  exercise_name?: string;
  muscle_group?: string;
  volume_multiplier?: number;
};

export type WorkoutSet = {
  id: string;
  workout_exercise_id: string;
  set_block_id?: string | null;
  order_index: number;
  weight: number;
  reps: number;
  target_reps?: number | null;
  rpe?: number | null;
  rir?: number | null;
  set_type: WorkoutSetType;
  outcome: WorkoutOutcome;
  is_selected_top_set: number;
  note?: string | null;
  estimated_1rm?: number;
};

export type MealEntry = {
  id: string;
  date: string;
  meal_type: MealType;
  name: string;
  calories_kcal: number;
  protein_g?: number | null;
  fat_g?: number | null;
  carbs_g?: number | null;
  input_type: MealInputType;
  confidence: Confidence;
  source?: string | null;
  note?: string | null;
  sync_status: SyncStatus;
};

export type BodyWeightLog = {
  id: string;
  date: string;
  weight_kg: number;
  note?: string | null;
  sync_status: SyncStatus;
};

export type UserProfile = {
  id: string;
  height_cm?: number | null;
  current_weight_kg?: number | null;
  target_weight_kg?: number | null;
  goal_type: GoalType;
  daily_calorie_target: number;
  protein_target_g: number;
  fat_target_g: number;
  carbs_target_g: number;
};

export type DailyNutritionSummary = {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  missingProtein: number;
  missingFat: number;
  missingCarbs: number;
  roughMeals: number;
};

export type ExerciseHistoryItem = {
  date: string;
  exercise_name: string;
  summary: string;
  top_weight?: number | null;
  top_reps?: number | null;
  estimated_1rm?: number | null;
  total_volume: number;
};

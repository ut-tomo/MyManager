export const localSchema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS gym_locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  note TEXT,
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  muscle_group TEXT NOT NULL,
  equipment_type TEXT NOT NULL,
  load_input_mode TEXT NOT NULL,
  volume_multiplier REAL NOT NULL DEFAULT 1,
  note TEXT,
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS equipment_instances (
  id TEXT PRIMARY KEY,
  gym_location_id TEXT NOT NULL REFERENCES gym_locations(id),
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  display_name TEXT NOT NULL,
  brand TEXT,
  note TEXT,
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workout_sessions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  gym_location_id TEXT REFERENCES gym_locations(id),
  started_at TEXT,
  ended_at TEXT,
  duration_minutes INTEGER,
  session_label TEXT,
  note TEXT,
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workout_exercises (
  id TEXT PRIMARY KEY,
  workout_session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  equipment_instance_id TEXT REFERENCES equipment_instances(id),
  order_index INTEGER NOT NULL,
  note TEXT,
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS set_blocks (
  id TEXT PRIMARY KEY,
  workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  target_weight REAL,
  target_reps INTEGER,
  target_sets INTEGER,
  note TEXT,
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workout_sets (
  id TEXT PRIMARY KEY,
  workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  set_block_id TEXT REFERENCES set_blocks(id),
  order_index INTEGER NOT NULL,
  weight REAL NOT NULL,
  reps INTEGER NOT NULL,
  target_reps INTEGER,
  rpe REAL,
  rir REAL,
  set_type TEXT NOT NULL DEFAULT 'working',
  outcome TEXT NOT NULL DEFAULT 'completed',
  is_selected_top_set INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_entries (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  meal_type TEXT NOT NULL,
  name TEXT NOT NULL,
  calories_kcal INTEGER NOT NULL,
  protein_g REAL,
  fat_g REAL,
  carbs_g REAL,
  input_type TEXT NOT NULL,
  confidence TEXT NOT NULL,
  source TEXT,
  note TEXT,
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingredients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  calories_per_100g REAL NOT NULL,
  protein_per_100g REAL NOT NULL,
  fat_per_100g REAL NOT NULL,
  carbs_per_100g REAL NOT NULL,
  default_unit TEXT NOT NULL DEFAULT 'g',
  note TEXT,
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_ingredients (
  id TEXT PRIMARY KEY,
  meal_entry_id TEXT NOT NULL REFERENCES meal_entries(id) ON DELETE CASCADE,
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
  amount_g REAL NOT NULL,
  calories_kcal INTEGER NOT NULL,
  protein_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  default_calories_kcal INTEGER NOT NULL,
  default_protein_g REAL,
  default_fat_g REAL,
  default_carbs_g REAL,
  note TEXT,
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS body_weight_logs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  weight_kg REAL NOT NULL,
  note TEXT,
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_profile (
  id TEXT PRIMARY KEY,
  height_cm REAL,
  current_weight_kg REAL,
  target_weight_kg REAL,
  goal_type TEXT NOT NULL,
  daily_calorie_target INTEGER NOT NULL,
  protein_target_g REAL NOT NULL,
  fat_target_g REAL NOT NULL,
  carbs_target_g REAL NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS weekly_reviews (
  id TEXT PRIMARY KEY,
  week_start_date TEXT NOT NULL,
  week_end_date TEXT NOT NULL,
  generated_at TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  user_reflection_text TEXT,
  workout_summary_json TEXT,
  nutrition_summary_json TEXT,
  bodyweight_summary_json TEXT,
  previous_context_summary TEXT,
  llm_input_json TEXT,
  llm_output_json TEXT,
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coach_memory (
  id TEXT PRIMARY KEY,
  long_term_summary TEXT,
  current_training_focus TEXT,
  recurring_issues TEXT,
  recent_recommendations TEXT,
  injuries_or_pain_notes TEXT,
  nutrition_patterns TEXT,
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workout_sessions_date ON workout_sessions(date);
CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise ON workout_sets(workout_exercise_id);
CREATE INDEX IF NOT EXISTS idx_meal_entries_date ON meal_entries(date);
CREATE INDEX IF NOT EXISTS idx_body_weight_logs_date ON body_weight_logs(date);
`;

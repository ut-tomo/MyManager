create type sync_status as enum ('local_only', 'synced', 'modified', 'conflict');
create type equipment_type as enum ('barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'cardio', 'other');
create type load_input_mode as enum ('total_load', 'per_hand_load', 'machine_stack', 'bodyweight');
create type set_block_label as enum ('free', 'same_weight_sets', '5x5', 'top_set', 'backoff', 'volume_work', 'pyramid', 'other');
create type workout_set_type as enum ('warmup', 'working', 'backoff', 'top', 'test');
create type workout_outcome as enum ('completed', 'failed', 'stopped_before_failure', 'assisted', 'easy');
create type meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack', 'other');
create type meal_input_type as enum ('manual_estimate', 'ingredient_based', 'template_based', 'copied_from_recent');
create type confidence as enum ('exact', 'estimated', 'rough');
create type goal_type as enum ('cut', 'bulk', 'maintain', 'recomposition');
create type weekly_review_status as enum ('draft', 'generated', 'regenerated', 'skipped');

create table gym_locations (
  id text primary key,
  name text not null,
  note text,
  sync_status sync_status not null default 'synced',
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table exercises (
  id text primary key,
  name text not null,
  muscle_group text not null,
  equipment_type equipment_type not null,
  load_input_mode load_input_mode not null,
  volume_multiplier numeric not null default 1,
  note text,
  sync_status sync_status not null default 'synced',
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table equipment_instances (
  id text primary key,
  gym_location_id text not null references gym_locations(id),
  exercise_id text not null references exercises(id),
  display_name text not null,
  brand text,
  note text,
  sync_status sync_status not null default 'synced',
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table workout_sessions (
  id text primary key,
  date date not null,
  gym_location_id text references gym_locations(id),
  started_at timestamptz,
  ended_at timestamptz,
  duration_minutes integer,
  session_label text,
  note text,
  sync_status sync_status not null default 'synced',
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table workout_exercises (
  id text primary key,
  workout_session_id text not null references workout_sessions(id),
  exercise_id text not null references exercises(id),
  equipment_instance_id text references equipment_instances(id),
  order_index integer not null,
  note text,
  sync_status sync_status not null default 'synced',
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table set_blocks (
  id text primary key,
  workout_exercise_id text not null references workout_exercises(id),
  label set_block_label not null,
  target_weight numeric,
  target_reps integer,
  target_sets integer,
  note text,
  sync_status sync_status not null default 'synced',
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table workout_sets (
  id text primary key,
  workout_exercise_id text not null references workout_exercises(id),
  set_block_id text references set_blocks(id),
  order_index integer not null,
  weight numeric not null,
  reps integer not null,
  target_reps integer,
  rpe numeric,
  rir numeric,
  set_type workout_set_type not null default 'working',
  outcome workout_outcome not null default 'completed',
  is_selected_top_set boolean not null default false,
  note text,
  sync_status sync_status not null default 'synced',
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table meal_entries (
  id text primary key,
  date date not null,
  meal_type meal_type not null,
  name text not null,
  calories_kcal integer not null,
  protein_g numeric,
  fat_g numeric,
  carbs_g numeric,
  input_type meal_input_type not null,
  confidence confidence not null,
  source text,
  note text,
  sync_status sync_status not null default 'synced',
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table ingredients (
  id text primary key,
  name text not null,
  calories_per_100g numeric not null,
  protein_per_100g numeric not null,
  fat_per_100g numeric not null,
  carbs_per_100g numeric not null,
  default_unit text not null default 'g',
  note text,
  sync_status sync_status not null default 'synced',
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table meal_ingredients (
  id text primary key,
  meal_entry_id text not null references meal_entries(id),
  ingredient_id text not null references ingredients(id),
  amount_g numeric not null,
  calories_kcal integer not null,
  protein_g numeric not null,
  fat_g numeric not null,
  carbs_g numeric not null,
  sync_status sync_status not null default 'synced',
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table meal_templates (
  id text primary key,
  name text not null,
  default_calories_kcal integer not null,
  default_protein_g numeric,
  default_fat_g numeric,
  default_carbs_g numeric,
  note text,
  sync_status sync_status not null default 'synced',
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table body_weight_logs (
  id text primary key,
  date date not null,
  weight_kg numeric not null,
  note text,
  sync_status sync_status not null default 'synced',
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table user_profile (
  id text primary key,
  height_cm numeric,
  current_weight_kg numeric,
  target_weight_kg numeric,
  goal_type goal_type not null,
  daily_calorie_target integer not null,
  protein_target_g numeric not null,
  fat_target_g numeric not null,
  carbs_target_g numeric not null,
  sync_status sync_status not null default 'synced',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table weekly_reviews (
  id text primary key,
  week_start_date date not null,
  week_end_date date not null,
  generated_at timestamptz,
  status weekly_review_status not null default 'draft',
  user_reflection_text text,
  workout_summary_json jsonb,
  nutrition_summary_json jsonb,
  bodyweight_summary_json jsonb,
  previous_context_summary text,
  llm_input_json jsonb,
  llm_output_json jsonb,
  sync_status sync_status not null default 'synced',
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table coach_memory (
  id text primary key,
  updated_at timestamptz not null,
  long_term_summary text,
  current_training_focus text,
  recurring_issues text,
  recent_recommendations text,
  injuries_or_pain_notes text,
  nutrition_patterns text,
  sync_status sync_status not null default 'synced'
);

create index workout_sessions_date_idx on workout_sessions(date);
create index workout_sets_exercise_idx on workout_sets(workout_exercise_id);
create index meal_entries_date_idx on meal_entries(date);
create index body_weight_logs_date_idx on body_weight_logs(date);

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type ReviewPayload = {
  week_start_date?: string;
  week_end_date?: string;
  user_reflection_text?: string;
  force?: boolean;
};

const disclaimer = 'このフィードバックは記録に基づく一般的な助言であり、医療・診断ではありません。';

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!supabaseUrl || !serviceRoleKey || !openaiKey) {
    return Response.json({ error: 'Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENAI_API_KEY' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const payload = (await req.json().catch(() => ({}))) as ReviewPayload;
  const week = resolveWeek(payload.week_start_date, payload.week_end_date);
  const prevStart = addDays(week.start, -30);

  const [profile, workouts, prevWorkouts, meals, weights, previousReviews, gyms, coachMemory, currentReview] = await Promise.all([
    supabase.from('user_profile').select('*').limit(1).maybeSingle(),
    supabase
      .from('workout_sessions')
      .select('*, workout_exercises(*, exercises(*), workout_sets(*), set_blocks(*))')
      .gte('date', week.start)
      .lte('date', week.end)
      .is('deleted_at', null),
    // 前30日: exercise_highlightsの「前回ベスト」比較用
    supabase
      .from('workout_sessions')
      .select('date, workout_exercises(exercise_id, deleted_at, exercises(name), workout_sets(weight, reps, deleted_at))')
      .gte('date', prevStart)
      .lt('date', week.start)
      .is('deleted_at', null),
    supabase.from('meal_entries').select('*').gte('date', week.start).lte('date', week.end).is('deleted_at', null),
    supabase.from('body_weight_logs').select('*').gte('date', week.start).lte('date', week.end).is('deleted_at', null).order('date'),
    supabase
      .from('weekly_reviews')
      .select('week_start_date, week_end_date, llm_output_json')
      .lt('week_start_date', week.start)
      .order('week_start_date', { ascending: false })
      .limit(4),
    supabase.from('gym_locations').select('id, name'),
    supabase.from('coach_memory').select('*').limit(1).maybeSingle(),
    supabase.from('weekly_reviews').select('id, user_reflection_text').eq('week_start_date', week.start).maybeSingle()
  ]);

  if (profile.error || workouts.error || prevWorkouts.error || meals.error || weights.error || previousReviews.error || gyms.error) {
    return Response.json({ error: 'Failed to load summary data' }, { status: 500 });
  }

  const gymNames = new Map<string, string>((gyms.data ?? []).map((gym: { id: string; name: string }) => [gym.id, gym.name]));
  // アプリから同期された感想メモがあればそれを使う（payload指定があれば優先）
  const reflection = payload.user_reflection_text ?? currentReview.data?.user_reflection_text ?? '';

  const llmInput = {
    profile: profile.data,
    week: { start: week.start, end: week.end },
    bodyweight: summarizeBodyweight(weights.data ?? []),
    workouts: summarizeWorkouts(workouts.data ?? [], prevWorkouts.data ?? [], gymNames),
    nutrition: summarizeNutrition(meals.data ?? [], profile.data),
    user_reflection: reflection,
    previous_reviews: (previousReviews.data ?? []).map((row: { week_start_date: string; llm_output_json: unknown }) => ({
      week_start_date: row.week_start_date,
      summary: extractReviewDigest(row.llm_output_json)
    })),
    coach_memory: coachMemory.data ?? null
  };

  const systemPrompt = `あなたは筋トレと食事記録の週次コーチです。医療診断はせず、記録に基づく一般的助言だけを返します。
必ず次のスキーマのJSONだけを返してください:
{
  "title": "週の要約タイトル",
  "overall_summary": "総評",
  "training_feedback": { "positive": [], "concerns": [], "suggestions": [] },
  "nutrition_feedback": { "positive": [], "concerns": [], "suggestions": [] },
  "next_week_actions": ["来週の具体的アクション"],
  "flags": ["痛み・怪我・過度な減量などの注意点。なければ「なし」と明記"],
  "disclaimer": "${disclaimer}",
  "coach_memory_update": {
    "long_term_summary": "これまでの経過の要約（coach_memoryを引き継ぎ更新）",
    "current_training_focus": "現在の焦点",
    "recurring_issues": "繰り返し出ている課題",
    "recent_recommendations": "直近の推奨事項",
    "injuries_or_pain_notes": "痛み・怪我のメモ（なければ空文字）",
    "nutrition_patterns": "食事の傾向"
  }
}
入力の coach_memory は前回までの長期メモです。今週の内容を踏まえて coach_memory_update を更新してください。日本語で書いてください。`;

  const completion = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(llmInput) }
      ]
    })
  });

  if (!completion.ok) {
    return Response.json({ error: await completion.text() }, { status: 500 });
  }

  const body = await completion.json();
  const text = body.choices?.[0]?.message?.content ?? '{}';
  const llmOutput = JSON.parse(text);
  const now = new Date().toISOString();

  // coach_memory_update はレビュー本文とは別テーブルへ保存する
  const memoryUpdate = llmOutput.coach_memory_update as Record<string, string> | undefined;
  delete llmOutput.coach_memory_update;

  const review = {
    id: currentReview.data?.id ?? crypto.randomUUID(),
    week_start_date: week.start,
    week_end_date: week.end,
    generated_at: now,
    status: currentReview.data ? 'regenerated' : 'generated',
    user_reflection_text: reflection || null,
    workout_summary_json: llmInput.workouts,
    nutrition_summary_json: llmInput.nutrition,
    bodyweight_summary_json: llmInput.bodyweight,
    previous_context_summary: JSON.stringify(llmInput.previous_reviews),
    llm_input_json: llmInput,
    llm_output_json: llmOutput,
    sync_status: 'synced',
    created_at: now,
    updated_at: now
  };

  const { error } = await supabase.from('weekly_reviews').upsert(review, { onConflict: 'id' });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (memoryUpdate) {
    const memoryRow = {
      id: coachMemory.data?.id ?? 'coach_memory',
      long_term_summary: memoryUpdate.long_term_summary ?? null,
      current_training_focus: memoryUpdate.current_training_focus ?? null,
      recurring_issues: memoryUpdate.recurring_issues ?? null,
      recent_recommendations: memoryUpdate.recent_recommendations ?? null,
      injuries_or_pain_notes: memoryUpdate.injuries_or_pain_notes ?? null,
      nutrition_patterns: memoryUpdate.nutrition_patterns ?? null,
      sync_status: 'synced',
      updated_at: now
    };
    const memoryResult = await supabase.from('coach_memory').upsert(memoryRow, { onConflict: 'id' });
    if (memoryResult.error) {
      // メモリ更新失敗はレビュー生成自体を失敗にしない
      console.error('coach_memory upsert failed:', memoryResult.error.message);
    }
  }

  return Response.json({ ok: true, review });
});

// ---- 週の解決 ----

function resolveWeek(start?: string, end?: string) {
  if (start && end) return { start, end };
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const jstDay = jst.getUTCDay();
  const mondayDiff = jstDay === 0 ? -6 : 1 - jstDay;
  const monday = new Date(jst);
  monday.setUTCDate(jst.getUTCDate() + mondayDiff);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---- 集計 ----

function epley1rm(weight: number, reps: number): number {
  if (!weight || !reps) return 0;
  if (reps === 1) return Math.round(weight * 10) / 10;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

const notDeleted = (row: { deleted_at?: string | null }) => row.deleted_at == null;

type SessionRow = {
  date: string;
  gym_location_id?: string | null;
  duration_minutes?: number | null;
  workout_exercises?: WorkoutExerciseRow[];
};

type WorkoutExerciseRow = {
  id: string;
  exercise_id: string;
  deleted_at?: string | null;
  exercises?: { name: string; muscle_group: string; volume_multiplier: number } | null;
  workout_sets?: SetRow[];
  set_blocks?: BlockRow[];
};

type SetRow = {
  weight: number;
  reps: number;
  is_selected_top_set?: boolean | number;
  outcome?: string;
  set_block_id?: string | null;
  deleted_at?: string | null;
};

type BlockRow = {
  id: string;
  label: string;
  target_weight?: number | null;
  target_reps?: number | null;
  target_sets?: number | null;
  deleted_at?: string | null;
};

function summarizeWorkouts(sessions: SessionRow[], prevSessions: SessionRow[], gymNames: Map<string, string>) {
  const byMuscleVolume: Record<string, number> = {};
  const highlights = new Map<
    string,
    { exercise: string; location: string | null; weight: number; reps: number; e1rm: number; volume: number }
  >();
  const setBlocks: Array<{ exercise: string; scheme: string; target: string; completed: string; failed_sets: number }> = [];

  for (const session of sessions) {
    const gymName = session.gym_location_id ? gymNames.get(session.gym_location_id) ?? null : null;
    for (const we of (session.workout_exercises ?? []).filter(notDeleted)) {
      const exercise = we.exercises;
      if (!exercise) continue;
      const sets = (we.workout_sets ?? []).filter(notDeleted);
      const multiplier = Number(exercise.volume_multiplier ?? 1);

      // 部位別ボリューム
      const volume = sets.reduce((sum, set) => sum + Number(set.weight) * Number(set.reps) * multiplier, 0);
      byMuscleVolume[exercise.muscle_group] = Math.round((byMuscleVolume[exercise.muscle_group] ?? 0) + volume);

      // 種目ハイライト: ユーザー選択のトップセット優先、なければ推定1RM最大のセット
      const top =
        sets.find((set) => set.is_selected_top_set === true || set.is_selected_top_set === 1) ??
        sets.reduce<SetRow | null>((best, set) => {
          if (!best) return set;
          return epley1rm(Number(set.weight), Number(set.reps)) > epley1rm(Number(best.weight), Number(best.reps)) ? set : best;
        }, null);
      if (top) {
        const e1rm = epley1rm(Number(top.weight), Number(top.reps));
        const current = highlights.get(we.exercise_id);
        if (!current || e1rm > current.e1rm) {
          highlights.set(we.exercise_id, {
            exercise: exercise.name,
            location: gymName,
            weight: Number(top.weight),
            reps: Number(top.reps),
            e1rm,
            volume: Math.round(volume)
          });
        }
      }

      // SetBlock達成状況
      for (const block of (we.set_blocks ?? []).filter(notDeleted)) {
        const blockSets = sets.filter((set) => set.set_block_id === block.id);
        const targetReps = block.target_reps ?? 0;
        const achieved = blockSets.filter((set) => set.outcome !== 'failed' && Number(set.reps) >= targetReps).length;
        const failed = blockSets.filter((set) => set.outcome === 'failed').length;
        setBlocks.push({
          exercise: exercise.name,
          scheme: block.label,
          target: block.target_weight ? `${block.target_weight}kg x ${block.target_reps} x ${block.target_sets}` : block.label,
          completed: `${achieved}/${block.target_sets ?? blockSets.length} sets`,
          failed_sets: failed
        });
      }
    }
  }

  // 前30日のベスト（種目ID → 最高e1RMのセット）
  const prevBest = new Map<string, { weight: number; reps: number; e1rm: number }>();
  for (const session of prevSessions) {
    for (const we of (session.workout_exercises ?? []).filter(notDeleted)) {
      for (const set of (we.workout_sets ?? []).filter(notDeleted)) {
        const e1rm = epley1rm(Number(set.weight), Number(set.reps));
        const current = prevBest.get(we.exercise_id);
        if (!current || e1rm > current.e1rm) {
          prevBest.set(we.exercise_id, { weight: Number(set.weight), reps: Number(set.reps), e1rm });
        }
      }
    }
  }

  const exerciseHighlights = [...highlights.entries()].map(([exerciseId, item]) => {
    const prev = prevBest.get(exerciseId);
    let trend = 'no_previous_data';
    if (prev) {
      const diff = item.e1rm - prev.e1rm;
      trend = diff > prev.e1rm * 0.01 ? 'up' : diff < -prev.e1rm * 0.01 ? 'down' : 'stable';
    }
    return {
      exercise: item.exercise,
      location: item.location,
      top_set: `${item.weight}kg x ${item.reps}`,
      estimated_1rm: item.e1rm,
      week_volume: item.volume,
      previous_best_30d: prev ? `${prev.weight}kg x ${prev.reps}` : null,
      previous_best_estimated_1rm: prev?.e1rm ?? null,
      trend
    };
  });

  return {
    sessions: sessions.length,
    total_duration_minutes: sessions.reduce((sum, session) => sum + Number(session.duration_minutes ?? 0), 0),
    by_muscle_group_volume: byMuscleVolume,
    exercise_highlights: exerciseHighlights,
    set_blocks: setBlocks
  };
}

function summarizeBodyweight(rows: Array<{ weight_kg: number }>) {
  const average = rows.length ? rows.reduce((sum, row) => sum + Number(row.weight_kg), 0) / rows.length : null;
  const change = rows.length >= 2 ? Number(rows[rows.length - 1].weight_kg) - Number(rows[0].weight_kg) : null;
  return {
    measurements: rows.length,
    average_kg: average == null ? null : Math.round(average * 10) / 10,
    weekly_change_kg: change == null ? null : Math.round(change * 10) / 10
  };
}

function summarizeNutrition(
  rows: Array<{ date: string; calories_kcal: number; protein_g: number | null; fat_g: number | null; carbs_g: number | null; confidence: string }>,
  profile: Record<string, unknown> | null
) {
  const days = new Set(rows.map((row) => row.date)).size || 1;
  const sums = rows.reduce(
    (sum, row) => ({
      calories: sum.calories + Number(row.calories_kcal),
      protein: sum.protein + Number(row.protein_g ?? 0),
      fat: sum.fat + Number(row.fat_g ?? 0),
      carbs: sum.carbs + Number(row.carbs_g ?? 0),
      missing: sum.missing + (row.protein_g == null || row.fat_g == null || row.carbs_g == null ? 1 : 0),
      rough: sum.rough + (row.confidence === 'rough' ? 1 : 0)
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0, missing: 0, rough: 0 }
  );
  return {
    logged_days: days,
    average_calories_kcal: Math.round(sums.calories / days),
    target_calories_kcal: profile?.daily_calorie_target,
    average_protein_g_known_only: Math.round(sums.protein / days),
    target_protein_g: profile?.protein_target_g,
    average_fat_g_known_only: Math.round(sums.fat / days),
    target_fat_g: profile?.fat_target_g,
    average_carbs_g_known_only: Math.round(sums.carbs / days),
    target_carbs_g: profile?.carbs_target_g,
    meals_with_missing_macros: sums.missing,
    rough_estimate_meals: sums.rough,
    estimated_meal_ratio: rows.length ? Math.round((sums.rough / rows.length) * 100) / 100 : 0
  };
}

// 過去レビューはタイトルと来週アクションだけに圧縮して渡す（トークン節約）
function extractReviewDigest(output: unknown): Record<string, unknown> | null {
  if (output == null) return null;
  const parsed = typeof output === 'string' ? safeParse(output) : output;
  if (parsed == null || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  return {
    title: record.title ?? null,
    overall_summary: record.overall_summary ?? null,
    next_week_actions: record.next_week_actions ?? null
  };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

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

  const [profile, workouts, meals, weights, previousReviews] = await Promise.all([
    supabase.from('user_profile').select('*').limit(1).maybeSingle(),
    supabase.from('workout_sessions').select('*, workout_exercises(*, exercises(*), workout_sets(*), set_blocks(*))').gte('date', week.start).lte('date', week.end).is('deleted_at', null),
    supabase.from('meal_entries').select('*').gte('date', week.start).lte('date', week.end).is('deleted_at', null),
    supabase.from('body_weight_logs').select('*').gte('date', week.start).lte('date', week.end).is('deleted_at', null).order('date'),
    supabase.from('weekly_reviews').select('week_start_date, week_end_date, llm_output_json').lt('week_start_date', week.start).order('week_start_date', { ascending: false }).limit(4)
  ]);

  if (profile.error || workouts.error || meals.error || weights.error || previousReviews.error) {
    return Response.json({ error: 'Failed to load summary data' }, { status: 500 });
  }

  const llmInput = {
    profile: profile.data,
    week: { start: week.start, end: week.end },
    bodyweight: summarizeBodyweight(weights.data ?? []),
    workouts: summarizeWorkouts(workouts.data ?? []),
    nutrition: summarizeNutrition(meals.data ?? [], profile.data),
    user_reflection: payload.user_reflection_text ?? '',
    previous_reviews: previousReviews.data ?? []
  };

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
        {
          role: 'system',
          content: `あなたは筋トレと食事記録の週次コーチです。医療診断はせず、記録に基づく一般的助言だけを返します。必ずJSONで返し、disclaimerには「${disclaimer}」を入れてください。`
        },
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

  const { data: existing } = await supabase
    .from('weekly_reviews')
    .select('id, status')
    .eq('week_start_date', week.start)
    .maybeSingle();

  const review = {
    id: existing?.id ?? crypto.randomUUID(),
    week_start_date: week.start,
    week_end_date: week.end,
    generated_at: now,
    status: existing ? 'regenerated' : 'generated',
    user_reflection_text: payload.user_reflection_text ?? null,
    workout_summary_json: llmInput.workouts,
    nutrition_summary_json: llmInput.nutrition,
    bodyweight_summary_json: llmInput.bodyweight,
    previous_context_summary: JSON.stringify(previousReviews.data ?? []),
    llm_input_json: llmInput,
    llm_output_json: llmOutput,
    sync_status: 'synced',
    created_at: now,
    updated_at: now
  };

  const { error } = await supabase.from('weekly_reviews').upsert(review, { onConflict: 'id' });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, review });
});

function resolveWeek(start?: string, end?: string) {
  if (start && end) return { start, end };
  const now = new Date();
  const day = now.getUTCDay();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const jstDay = jst.getUTCDay();
  const mondayDiff = jstDay === 0 ? -6 : 1 - jstDay;
  const monday = new Date(jst);
  monday.setUTCDate(jst.getUTCDate() + mondayDiff);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  void day;
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
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

function summarizeNutrition(rows: Array<{ date: string; calories_kcal: number; protein_g: number | null; fat_g: number | null; carbs_g: number | null; confidence: string }>, profile: Record<string, unknown> | null) {
  const days = new Set(rows.map((row) => row.date)).size || 1;
  const sums = rows.reduce((sum, row) => ({
    calories: sum.calories + Number(row.calories_kcal),
    protein: sum.protein + Number(row.protein_g ?? 0),
    fat: sum.fat + Number(row.fat_g ?? 0),
    carbs: sum.carbs + Number(row.carbs_g ?? 0),
    missing: sum.missing + (row.protein_g == null || row.fat_g == null || row.carbs_g == null ? 1 : 0),
    rough: sum.rough + (row.confidence === 'rough' ? 1 : 0)
  }), { calories: 0, protein: 0, fat: 0, carbs: 0, missing: 0, rough: 0 });
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

function summarizeWorkouts(rows: Array<Record<string, unknown>>) {
  return {
    sessions: rows.length,
    total_duration_minutes: rows.reduce((sum, row) => sum + Number(row.duration_minutes ?? 0), 0),
    note: 'Detailed exercise highlights are computed from joined workout_exercises/workout_sets in future iterations.'
  };
}

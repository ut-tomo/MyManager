import { saveGeneratedReview } from '../db/client';
import { addDaysISO, weekStartMondayISO } from '../utils/date';
import { supabase } from './supabase';
import { syncNow } from './sync';

export type GenerateResult =
  | { ok: true }
  | { ok: false; message: string };

// 週次レビューを手動生成する。
// Edge Function はSupabase上のデータを集計するため、先にローカル変更を同期してから呼ぶ。
export async function generateWeeklyReview(reflectionText: string): Promise<GenerateResult> {
  if (!supabase) {
    return { ok: false, message: 'Supabaseが未設定です。.envにEXPO_PUBLIC_SUPABASE_URLとEXPO_PUBLIC_SUPABASE_ANON_KEYを設定してください。' };
  }

  const sync = await syncNow();
  if (sync.errors.length > 0) {
    return { ok: false, message: `同期に失敗しました: ${sync.errors[0].table} / ${sync.errors[0].message}` };
  }

  const start = weekStartMondayISO();
  const end = addDaysISO(start, 6);
  const { data, error } = await supabase.functions.invoke('generate-weekly-review', {
    body: { week_start_date: start, week_end_date: end, user_reflection_text: reflectionText, force: true }
  });
  if (error) {
    return { ok: false, message: `レビュー生成に失敗しました: ${error.message}` };
  }
  const review = (data as { review?: Record<string, unknown> } | null)?.review;
  if (!review) {
    return { ok: false, message: 'Edge Functionの応答にレビューが含まれていません。' };
  }
  await saveGeneratedReview(review);
  return { ok: true };
}

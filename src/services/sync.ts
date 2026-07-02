import { db } from '../db/client';
import { supabase } from './supabase';

const SYNC_TABLES = [
  'gym_locations',
  'exercises',
  'equipment_instances',
  'workout_sessions',
  'workout_exercises',
  'set_blocks',
  'workout_sets',
  'meal_entries',
  'ingredients',
  'meal_ingredients',
  'meal_templates',
  'body_weight_logs',
  'user_profile',
  'weekly_reviews',
  'coach_memory'
] as const;

type SyncResult = {
  pushed: number;
  errors: Array<{ table: string; message: string }>;
};

// 未同期（local_only / modified）の行数合計。設定画面の表示用。
export async function getPendingSyncCount(): Promise<number> {
  let total = 0;
  for (const table of SYNC_TABLES) {
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${table} WHERE sync_status IN ('local_only', 'modified')`
    );
    total += row?.count ?? 0;
  }
  return total;
}

export async function pushLocalChanges(): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, errors: [] };
  if (!supabase) {
    return { pushed: 0, errors: [{ table: 'config', message: 'Supabase env is not configured' }] };
  }

  for (const table of SYNC_TABLES) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${table} WHERE sync_status IN ('local_only', 'modified')`
    );
    if (rows.length === 0) continue;

    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
    if (error) {
      result.errors.push({ table, message: error.message });
      continue;
    }

    const ids = rows.map((row) => row.id as string);
    for (const id of ids) {
      await db.runAsync(`UPDATE ${table} SET sync_status = 'synced' WHERE id = ?`, [id]);
    }
    result.pushed += rows.length;
  }

  return result;
}

export async function pullRemoteTable(table: (typeof SYNC_TABLES)[number]): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase.from(table).select('*');
  if (error || !data) return 0;

  for (const row of data as Array<Record<string, unknown>>) {
    const local = await db.getFirstAsync<{ updated_at?: string; sync_status?: string }>(
      `SELECT updated_at, sync_status FROM ${table} WHERE id = ?`,
      [row.id as string]
    );
    if (local?.sync_status === 'modified' || local?.sync_status === 'local_only') {
      const localTime = new Date(local.updated_at ?? 0).getTime();
      const remoteTime = new Date((row.updated_at as string | undefined) ?? 0).getTime();
      if (localTime > remoteTime) continue;
    }

    const keys = Object.keys(row);
    const placeholders = keys.map(() => '?').join(', ');
    const updates = keys.map((key) => `${key} = excluded.${key}`).join(', ');
    await db.runAsync(
      `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})
       ON CONFLICT(id) DO UPDATE SET ${updates}`,
      keys.map((key) => row[key] as SQLiteBindValue)
    );
  }
  return data.length;
}

export async function syncNow(): Promise<SyncResult> {
  const pushed = await pushLocalChanges();
  if (pushed.errors.length > 0) return pushed;
  for (const table of SYNC_TABLES) {
    await pullRemoteTable(table);
  }
  return pushed;
}

type SQLiteBindValue = string | number | boolean | null;

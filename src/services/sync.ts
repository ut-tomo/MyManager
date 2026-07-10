import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../db/client';
import { supabase } from './supabase';

const LAST_SYNC_KEY = 'my_manager_last_sync_at';

export async function getLastSyncAt(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_SYNC_KEY);
}

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
  'meal_template_ingredients',
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

    // ローカルはTEXTでJSONを持つが、Postgres側はjsonb。
    // 文字列のまま送ると二重エンコードになるため、_json列はオブジェクトに戻して送る。
    const payload = rows.map((row) => {
      const out: Record<string, unknown> = { ...row };
      for (const key of Object.keys(out)) {
        if (key.endsWith('_json') && typeof out[key] === 'string') {
          try {
            out[key] = JSON.parse(out[key] as string);
          } catch {
            // JSONとして不正ならそのまま送る
          }
        }
      }
      // 'modified'のまま送るとpull時に同期済みの行が未同期へ戻ってしまう
      out.sync_status = 'synced';
      return out;
    });

    const { error } = await supabase.from(table).upsert(payload, { onConflict: 'id' });
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

    // サーバー由来の行はローカルでは常に「同期済み」。過去に'modified'のまま
    // 保存されたサーバー行を取り込んでも未同期へ戻らないよう強制する。
    row.sync_status = 'synced';
    const keys = Object.keys(row);
    const placeholders = keys.map(() => '?').join(', ');
    const updates = keys.map((key) => `${key} = excluded.${key}`).join(', ');
    await db.runAsync(
      `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})
       ON CONFLICT(id) DO UPDATE SET ${updates}`,
      keys.map((key) => toBindValue(row[key]))
    );
  }
  return data.length;
}

// Postgresのjsonb（オブジェクト/配列）やbooleanはSQLiteに直接バインドできないため変換する
function toBindValue(value: unknown): SQLiteBindValue {
  if (value == null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object') return JSON.stringify(value);
  return value as string | number;
}

export async function syncNow(): Promise<SyncResult> {
  const pushed = await pushLocalChanges();
  if (pushed.errors.length > 0) return pushed;
  for (const table of SYNC_TABLES) {
    await pullRemoteTable(table);
  }
  if (supabase) {
    await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString()).catch(() => null);
  }
  return pushed;
}

type SQLiteBindValue = string | number | boolean | null;

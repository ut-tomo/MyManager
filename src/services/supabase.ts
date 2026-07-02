import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';

const extra = Constants.expoConfig?.extra as { supabaseUrl?: string; supabaseAnonKey?: string } | undefined;

function readExpoEnv(value?: string): string {
  if (!value) return '';
  if (value.startsWith('${') && value.endsWith('}')) return '';
  return value.trim();
}

function isValidSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.includes('supabase');
  } catch {
    return false;
  }
}

export const supabaseUrl = readExpoEnv(process.env.EXPO_PUBLIC_SUPABASE_URL) || readExpoEnv(extra?.supabaseUrl);
export const supabaseAnonKey = readExpoEnv(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) || readExpoEnv(extra?.supabaseAnonKey);

export const supabase = isValidSupabaseUrl(supabaseUrl) && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      }
    })
  : null;

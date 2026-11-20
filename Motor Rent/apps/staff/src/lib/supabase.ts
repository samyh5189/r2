import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
/** False until EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are set (copy .env.example to .env). */
export const supabaseConfigured = Boolean(url && anonKey);

/**
 * Session tokens live in the iOS Keychain / Android Keystore, never in plain AsyncStorage.
 * SecureStore values are limited (~2 KB), so long sessions are split into chunks.
 */
const CHUNK = 1800;
const secureStorage = {
  async getItem(key: string) {
    const count = Number(await SecureStore.getItemAsync(`${key}.n`));
    if (!count) return null;
    const parts = await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)));
    return parts.some((p) => p === null) ? null : parts.join('');
  },
  async setItem(key: string, value: string) {
    await secureStorage.removeItem(key);
    const parts = value.match(new RegExp(`.{1,${CHUNK}}`, 'gs')) ?? [''];
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${key}.${i}`, p)));
    await SecureStore.setItemAsync(`${key}.n`, String(parts.length));
  },
  async removeItem(key: string) {
    const count = Number(await SecureStore.getItemAsync(`${key}.n`));
    await Promise.all(Array.from({ length: count || 0 }, (_, i) => SecureStore.deleteItemAsync(`${key}.${i}`)));
    await SecureStore.deleteItemAsync(`${key}.n`);
  },
};

export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'not-configured', {
  auth: {
    storage: Platform.OS === 'web' ? undefined : secureStorage, // web uses localStorage
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

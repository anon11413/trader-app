/**
 * Supabase auth client — handles login, registration, session management.
 * Cross-platform storage adapter for web (localStorage/sessionStorage).
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// These will come from environment / app.config
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const REMEMBER_ME_KEY = 'trader_remember_me';
const AUTH_STORAGE_KEY = 'sb-auth-token';

/**
 * Cross-platform storage adapter.
 * On web: uses localStorage (remember me) or sessionStorage (session only).
 */
function createStorageAdapter() {
  if (Platform.OS !== 'web') {
    // Fallback for non-web (not used in this app, but safe)
    const mem = new Map<string, string>();
    return {
      getItem: (key: string) => mem.get(key) ?? null,
      setItem: (key: string, value: string) => { mem.set(key, value); },
      removeItem: (key: string) => { mem.delete(key); },
    };
  }

  return {
    getItem: (key: string): string | null => {
      const rememberMe = localStorage.getItem(REMEMBER_ME_KEY) === 'true';
      const primary = rememberMe ? localStorage : sessionStorage;
      const secondary = rememberMe ? sessionStorage : localStorage;
      return primary.getItem(key) ?? secondary.getItem(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      const rememberMe = localStorage.getItem(REMEMBER_ME_KEY) === 'true';
      if (rememberMe) {
        localStorage.setItem(key, value);
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, value);
        localStorage.removeItem(key);
      }
    },
    removeItem: (key: string) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    },
  };
}

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      storage: createStorageAdapter(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);

/**
 * Set remember-me preference.
 */
export function setRememberMe(remember: boolean) {
  if (Platform.OS === 'web') {
    localStorage.setItem(REMEMBER_ME_KEY, String(remember));
  }
}

export function getRememberMe(): boolean {
  if (Platform.OS === 'web') {
    return localStorage.getItem(REMEMBER_ME_KEY) === 'true';
  }
  return false;
}

/**
 * Ensure we have a valid session, refresh if needed.
 */
export async function ensureSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  // Check if token expires within 5 minutes
  const expiresAt = session.expires_at ?? 0;
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt - now < 300) {
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    return refreshed;
  }

  return session;
}

/**
 * Get current JWT access token.
 */
export async function getAccessToken(): Promise<string | null> {
  const session = await ensureSession();
  return session?.access_token ?? null;
}

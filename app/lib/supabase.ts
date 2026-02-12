/**
 * Supabase auth client — handles login, registration, session management.
 * Uses runtime config from /api/config so no build-time env vars needed.
 * Cross-platform storage adapter for web (localStorage/sessionStorage).
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const REMEMBER_ME_KEY = 'trader_remember_me';

// Try build-time env vars first, fall back to runtime fetch
let SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
let SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Cross-platform storage adapter.
 * On web: uses localStorage (remember me) or sessionStorage (session only).
 */
function createStorageAdapter() {
  if (Platform.OS !== 'web') {
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

function buildClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      storage: createStorageAdapter(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

// Lazy-initialized client — resolves after runtime config is fetched
let _client: SupabaseClient | null = null;
let _clientPromise: Promise<SupabaseClient> | null = null;

/**
 * Get the Supabase client. Lazily initializes on first call.
 * If build-time env vars are present, uses them immediately.
 * Otherwise, fetches /api/config from the server.
 */
export function getSupabaseClient(): Promise<SupabaseClient> {
  if (_client) return Promise.resolve(_client);
  if (_clientPromise) return _clientPromise;

  // If env vars were baked in at build time, use them directly
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    _client = buildClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return Promise.resolve(_client);
  }

  // Otherwise fetch from server at runtime (with timeout)
  _clientPromise = Promise.race([
    fetch('/api/config')
      .then((res) => res.json())
      .then((cfg: { supabaseUrl: string; supabaseAnonKey: string }) => {
        SUPABASE_URL = cfg.supabaseUrl;
        SUPABASE_ANON_KEY = cfg.supabaseAnonKey;
        _client = buildClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        return _client;
      }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Supabase config fetch timed out after 8s')), 8000)
    ),
  ]).catch((err) => {
    console.error('[Supabase] Failed to initialize:', err);
    _clientPromise = null; // allow retry on next call
    throw err;
  });

  return _clientPromise;
}

/**
 * Synchronous accessor — returns null if not yet initialized.
 * Use getSupabaseClient() for the async version.
 */
export function getSupabaseSync(): SupabaseClient | null {
  return _client;
}

// Also export a `supabase` property for backwards compat — will be null until init
// Most code should use getSupabaseClient() instead
export let supabase: SupabaseClient = null as any;

// Auto-initialize on import
getSupabaseClient().then((c) => {
  supabase = c;
});

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
  const client = await getSupabaseClient();
  const { data: { session } } = await client.auth.getSession();
  if (!session) return null;

  const expiresAt = session.expires_at ?? 0;
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt - now < 300) {
    const { data: { session: refreshed } } = await client.auth.refreshSession();
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

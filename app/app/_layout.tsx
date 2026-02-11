/**
 * Root layout — PaperProvider with dark theme.
 * No auth gate — all users see the app. Socket connects publicly for price feed.
 * Auth state only used for authenticated features (trading, accounts).
 */
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { PaperProvider, MD3DarkTheme } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { getSupabaseClient, getAccessToken } from '../lib/supabase';
import { useStore } from '../lib/store';
import { gameSocket } from '../lib/socket';
import { bootstrapAccounts } from '../lib/simApi';

const theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: colors.primary,
    background: colors.background,
    surface: colors.surface,
    error: colors.error,
    onPrimary: '#000',
    onBackground: colors.text,
    onSurface: colors.text,
  },
};

export default function RootLayout() {
  const { setAuth, clearAuth, isAuthenticated } = useStore();
  const [initializing, setInitializing] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  // Navigate away from auth screens when authenticated
  useEffect(() => {
    if (initializing) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (isAuthenticated && inAuthGroup) {
      // User just signed in — navigate to the main tabs
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, segments, initializing]);

  useEffect(() => {
    // Always connect socket for public price feed (no auth needed)
    gameSocket.connect();

    /** Helper to fetch player and set auth with retry.
     *  After registration the player row may not be queryable yet,
     *  so we retry a couple of times with a small delay. */
    async function fetchPlayerAndSetAuth(
      sb: Awaited<ReturnType<typeof getSupabaseClient>>,
      userId: string,
      retries = 3,
      delay = 600,
    ): Promise<boolean> {
      for (let attempt = 0; attempt < retries; attempt++) {
        const { data: player } = await sb
          .from('players')
          .select('username, display_name')
          .eq('id', userId)
          .single();

        if (player) {
          setAuth(userId, player.username, player.display_name);
          gameSocket.authenticate();
          const token = await getAccessToken();
          if (token) bootstrapAccounts(token).catch(() => {});
          return true;
        }
        // Wait before retrying (row may not be committed yet)
        if (attempt < retries - 1) {
          await new Promise(r => setTimeout(r, delay));
        }
      }
      return false;
    }

    async function checkSession() {
      try {
        const sb = await getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        if (session?.user) {
          const found = await fetchPlayerAndSetAuth(sb, session.user.id);
          if (!found) clearAuth();
        } else {
          clearAuth();
        }
      } catch (e) {
        console.error('[Auth] Session check failed:', e);
        clearAuth();
      } finally {
        setInitializing(false);
      }
    }
    checkSession();

    // Listen for auth changes
    let subscription: any = null;
    getSupabaseClient().then((sb) => {
      const { data: { subscription: sub } } = sb.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const found = await fetchPlayerAndSetAuth(sb, session.user.id);
          if (!found) {
            console.warn('[Auth] Player record not found after sign-in');
            // Still set basic auth so the user isn't stuck
            setAuth(session.user.id, session.user.email || 'Player', null);
          }
        } else if (event === 'SIGNED_OUT') {
          clearAuth();
          // Socket stays connected for public price feed, just lose auth
        }
      });
      subscription = sub;
    });

    return () => {
      if (subscription) subscription.unsubscribe();
      gameSocket.disconnect();
    };
  }, []);

  if (initializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <PaperProvider theme={theme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'fade',
        }}
      >
        {/* Always show tabs — no auth gate */}
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen
          name="instrument/[id]"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />
      </Stack>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});

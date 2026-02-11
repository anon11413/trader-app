/**
 * Root layout — PaperProvider with dark theme, auth gate,
 * socket connection management.
 */
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
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
  const { isAuthenticated, isLoading, setAuth, clearAuth, setLoading } = useStore();
  const [initializing, setInitializing] = useState(true);

  // Check existing session on mount
  useEffect(() => {
    async function checkSession() {
      try {
        const sb = await getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        if (session?.user) {
          // Fetch player info
          const { data: player } = await sb
            .from('players')
            .select('username, display_name')
            .eq('id', session.user.id)
            .single();

          if (player) {
            setAuth(session.user.id, player.username, player.display_name);
            // Connect socket
            gameSocket.connect();
            // Bootstrap accounts
            const token = await getAccessToken();
            if (token) bootstrapAccounts(token).catch(() => {});
          } else {
            clearAuth();
          }
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
          const { data: player } = await sb
            .from('players')
            .select('username, display_name')
            .eq('id', session.user.id)
            .single();

        if (player) {
          setAuth(session.user.id, player.username, player.display_name);
          gameSocket.connect();
          const token = await getAccessToken();
          if (token) bootstrapAccounts(token).catch(() => {});
        }
        } else if (event === 'SIGNED_OUT') {
          gameSocket.disconnect();
          clearAuth();
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
        {isAuthenticated ? (
          <Stack.Screen name="(tabs)" />
        ) : (
          <Stack.Screen name="(auth)" />
        )}
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

/**
 * Register screen — email, username, password with real-time username check.
 */
import { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text, TextInput, Button, HelperText } from 'react-native-paper';
import { Link, useRouter } from 'expo-router';
import { colors, spacing, fontSize } from '../../theme';
import { getSupabaseClient, setRememberMe } from '../../lib/supabase';
import { useStore } from '../../lib/store';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<'auto' | 'confirm_email' | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const isAuthenticated = useStore(s => s.isAuthenticated);

  // When auth succeeds after registration, navigate to main app
  useEffect(() => {
    if (success === 'auto' && isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [success, isAuthenticated]);

  // Fallback: if 'auto' success but auth doesn't fire within 4s, navigate anyway
  useEffect(() => {
    if (success !== 'auto') return;
    const timer = setTimeout(() => {
      router.replace('/(tabs)');
    }, 4000);
    return () => clearTimeout(timer);
  }, [success]);

  // Debounced username availability check
  useEffect(() => {
    if (username.length < 3) {
      setUsernameStatus('idle');
      return;
    }

    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const sb = await getSupabaseClient();
        const { data, error } = await sb.rpc('check_username_available', {
          p_username: username.trim(),
        });
        if (error) {
          setUsernameStatus('idle');
          return;
        }
        setUsernameStatus(data?.available ? 'available' : 'taken');
      } catch {
        setUsernameStatus('idle');
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [username]);

  async function handleRegister() {
    // Validation
    if (!email.trim() || !username.trim() || !password) {
      setError('Please fill in all fields');
      return;
    }
    if (username.trim().length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      setError('Username can only contain letters, numbers, and underscores');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (usernameStatus === 'taken') {
      setError('Username is already taken');
      return;
    }

    setError('');
    setSuccess(null);
    setLoading(true);

    try {
      // 1. Create auth user
      const sb = await getSupabaseClient();
      const { data: authData, error: authError } = await sb.auth.signUp({
        email: email.trim(),
        password,
      });

      if (authError) {
        // Handle rate limiting
        if (authError.status === 429) {
          setError('Too many attempts — please wait a minute and try again');
        } else {
          setError(authError.message);
        }
        return;
      }

      if (!authData.user) {
        setError('Registration failed — no user returned');
        return;
      }

      // 2. Register player (creates player record + default account)
      const { data: regResult, error: regError } = await sb.rpc('register_player', {
        p_user_id: authData.user.id,
        p_username: username.trim(),
        p_display_name: username.trim(),
      });

      if (regError) {
        // 409 means player was already registered (retry scenario) — that's OK
        if (regError.code === '23505' || regError.message?.includes('already')) {
          console.log('[Register] Player already registered (retry), continuing...');
        } else {
          setError(regError.message);
          return;
        }
      }

      if (regResult && !regResult.success && regResult.error && !regResult.error.includes('already')) {
        setError(regResult.error || 'Registration failed');
        return;
      }

      // Remember by default for new accounts
      setRememberMe(true);

      // Check if email confirmation is required:
      // If signUp returns a user but no session, email confirmation is pending
      if (authData.user && !authData.session) {
        setSuccess('confirm_email');
      } else {
        setSuccess('auto');
        // Auth state change will handle the rest (in _layout.tsx)
      }
    } catch (e: any) {
      setError(e.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Start trading with €100</Text>
        </View>

        {/* Success: email confirmation required */}
        {success === 'confirm_email' && (
          <View style={styles.successBox}>
            <Text style={styles.successTitle}>Account Created!</Text>
            <Text style={styles.successText}>
              Check your email ({email}) and click the confirmation link, then sign in.
            </Text>
            <Link href="/(auth)/login" style={styles.successLink}>
              <Text style={styles.linkHighlight}>Go to Sign In</Text>
            </Link>
          </View>
        )}

        {/* Success: auto-logged in (no email confirmation) */}
        {success === 'auto' && (
          <View style={styles.successBox}>
            <Text style={styles.successTitle}>Account Created!</Text>
            <Text style={styles.successText}>
              Welcome aboard! Logging you in...
            </Text>
          </View>
        )}

        {/* Registration form (hidden after success) */}
        {!success && (
        <View style={styles.form}>
          <TextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            mode="outlined"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.text}
            style={styles.input}
            theme={{ colors: { onSurfaceVariant: colors.textDim } }}
          />

          <TextInput
            label="Username"
            value={username}
            onChangeText={setUsername}
            mode="outlined"
            autoCapitalize="none"
            outlineColor={
              usernameStatus === 'available' ? colors.success :
              usernameStatus === 'taken' ? colors.error :
              colors.border
            }
            activeOutlineColor={
              usernameStatus === 'available' ? colors.success :
              usernameStatus === 'taken' ? colors.error :
              colors.primary
            }
            textColor={colors.text}
            style={styles.input}
            theme={{ colors: { onSurfaceVariant: colors.textDim } }}
            right={
              usernameStatus === 'checking' ? (
                <TextInput.Icon icon="loading" color={colors.textDim} />
              ) : usernameStatus === 'available' ? (
                <TextInput.Icon icon="check-circle" color={colors.success} />
              ) : usernameStatus === 'taken' ? (
                <TextInput.Icon icon="close-circle" color={colors.error} />
              ) : null
            }
          />
          {usernameStatus === 'taken' && (
            <HelperText type="error" visible style={styles.helperError}>
              Username is already taken
            </HelperText>
          )}
          {usernameStatus === 'available' && (
            <HelperText type="info" visible style={styles.helperSuccess}>
              Username is available!
            </HelperText>
          )}

          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            mode="outlined"
            secureTextEntry={!showPassword}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.text}
            style={styles.input}
            theme={{ colors: { onSurfaceVariant: colors.textDim } }}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowPassword(!showPassword)}
                color={colors.textDim}
              />
            }
          />

          {error ? (
            <HelperText type="error" visible style={styles.helperError}>
              {error}
            </HelperText>
          ) : null}

          <Button
            mode="contained"
            onPress={handleRegister}
            loading={loading}
            disabled={loading || usernameStatus === 'taken'}
            style={styles.button}
            buttonColor={colors.primary}
            textColor="#000"
            labelStyle={styles.buttonLabel}
          >
            Create Account
          </Button>

          <View style={styles.linkRow}>
            <Text style={styles.linkText}>Already have an account? </Text>
            <Link href="/(auth)/login" style={styles.link}>
              <Text style={styles.linkHighlight}>Sign In</Text>
            </Link>
          </View>
        </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.lg,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  successBox: {
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.success + '40',
    alignItems: 'center',
    gap: spacing.md,
  },
  successTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.success,
  },
  successText: {
    fontSize: fontSize.md,
    color: colors.textDim,
    textAlign: 'center',
    lineHeight: 22,
  },
  successLink: {
    marginTop: spacing.sm,
  },
  form: {
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  input: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  helperError: {
    color: colors.error,
    marginTop: -spacing.sm,
    marginBottom: spacing.xs,
  },
  helperSuccess: {
    color: colors.success,
    marginTop: -spacing.sm,
    marginBottom: spacing.xs,
  },
  button: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 8,
  },
  buttonLabel: {
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  linkText: {
    color: colors.textDim,
    fontSize: fontSize.md,
  },
  link: {},
  linkHighlight: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});

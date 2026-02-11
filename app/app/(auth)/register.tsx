/**
 * Register screen — email, username, password with real-time username check.
 */
import { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text, TextInput, Button, HelperText } from 'react-native-paper';
import { Link } from 'expo-router';
import { colors, spacing, fontSize } from '../../theme';
import { getSupabaseClient, setRememberMe } from '../../lib/supabase';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [showPassword, setShowPassword] = useState(false);

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
    if (!email.trim() || !username.trim() || !password || !confirmPassword) {
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
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (usernameStatus === 'taken') {
      setError('Username is already taken');
      return;
    }

    setError('');
    setLoading(true);

    try {
      // 1. Create auth user
      const sb = await getSupabaseClient();
      const { data: authData, error: authError } = await sb.auth.signUp({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(authError.message);
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
        setError(regError.message);
        return;
      }

      if (regResult && !regResult.success) {
        setError(regResult.error || 'Registration failed');
        return;
      }

      // Remember by default for new accounts
      setRememberMe(true);

      // Auth state change will handle the rest (in _layout.tsx)
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

          <TextInput
            label="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            mode="outlined"
            secureTextEntry={!showPassword}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.text}
            style={styles.input}
            theme={{ colors: { onSurfaceVariant: colors.textDim } }}
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

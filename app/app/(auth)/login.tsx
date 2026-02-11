/**
 * Login screen — email/password with remember-me toggle.
 */
import { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text, TextInput, Button, Checkbox, HelperText } from 'react-native-paper';
import { Link } from 'expo-router';
import { colors, spacing, fontSize } from '../../theme';
import { getSupabaseClient, setRememberMe, getRememberMe } from '../../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRemember] = useState(getRememberMe());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError('Please enter email and password');
      return;
    }

    setError('');
    setLoading(true);

    try {
      setRememberMe(rememberMe);
      const sb = await getSupabaseClient();
      const { error: authError } = await sb.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(authError.message);
      }
      // Success is handled by onAuthStateChange in _layout.tsx
    } catch (e: any) {
      setError(e.message || 'Login failed');
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
          <Text style={styles.title}>Trader App</Text>
          <Text style={styles.subtitle}>Trade the Economy</Text>
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

          <View style={styles.rememberRow}>
            <Checkbox.Android
              status={rememberMe ? 'checked' : 'unchecked'}
              onPress={() => setRemember(!rememberMe)}
              color={colors.primary}
              uncheckedColor={colors.textDim}
            />
            <Text style={styles.rememberText} onPress={() => setRemember(!rememberMe)}>
              Remember me
            </Text>
          </View>

          {error ? (
            <HelperText type="error" visible style={styles.error}>
              {error}
            </HelperText>
          ) : null}

          <Button
            mode="contained"
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
            style={styles.button}
            buttonColor={colors.primary}
            textColor="#000"
            labelStyle={styles.buttonLabel}
          >
            Sign In
          </Button>

          <View style={styles.linkRow}>
            <Text style={styles.linkText}>Don't have an account? </Text>
            <Link href="/(auth)/register" style={styles.link}>
              <Text style={styles.linkHighlight}>Sign Up</Text>
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
    fontSize: fontSize.hero,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: fontSize.lg,
    color: colors.textDim,
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
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  rememberText: {
    color: colors.textDim,
    fontSize: fontSize.md,
  },
  error: {
    color: colors.error,
    marginBottom: spacing.sm,
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

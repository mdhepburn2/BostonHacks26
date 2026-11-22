import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ApiError } from '@/api/client';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';

type AuthFormProps = { mode: 'login' | 'register' };

/** Shared by the login and register screens. Closes the modal once logged in. */
export function AuthForm({ mode }: AuthFormProps) {
  const auth = useAuth();
  const theme = useTheme();
  const registering = mode === 'register';
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = username.trim().length > 0 && password.length > 0;

  const submit = async () => {
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const credentials = { username: username.trim(), password };
      if (registering) await auth.register({ ...credentials, email: email.trim() || undefined });
      else await auth.login(credentials);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Screen
      title={registering ? 'Create account' : 'Log in'}
      subtitle={
        registering
          ? 'Save places, check them off, and see where your friends are going.'
          : 'Welcome back. Pick up where you left off.'
      }>
      <View style={styles.fields}>
        <Field
          label="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
        />
        {registering ? (
          <Field
            label="Email (optional)"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
        ) : null}
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={registering ? 'new-password' : 'current-password'}
          textContentType={registering ? 'newPassword' : 'password'}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </View>

      {error ? (
        <ThemedText type="small" style={{ color: theme.tint }} accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={registering ? 'Create account' : 'Log in'}
          onPress={submit}
          loading={submitting}
          disabled={!ready}
        />
        <Button
          variant="plain"
          label={registering ? 'I already have an account' : 'New here? Create an account'}
          onPress={() => router.replace(registering ? '/login' : '/register')}
        />
      </View>
    </Screen>
  );
}

function Field({ label, ...input }: TextInputProps & { label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      <TextInput
        {...input}
        autoCorrect={false}
        accessibilityLabel={label}
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fields: {
    gap: Spacing.three,
  },
  field: {
    gap: Spacing.one,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    borderCurve: 'continuous',
    fontFamily: Fonts.body,
    fontSize: 16,
  },
  actions: {
    gap: Spacing.two,
  },
});

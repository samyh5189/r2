import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, ErrorText, Field } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

/** Landing page of the "forgot password" email: the link signs the user in, then they choose a new password. */
export default function ResetPasswordScreen() {
  const { session, loading } = useSession();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const valid = pw.length >= 8 && /[a-z]/i.test(pw) && /\d/.test(pw) && pw === pw2;

  async function save() {
    setBusy(true); setError(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError(error.message);
    setDone(true);
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.body}>
        <Card style={{ gap: Spacing.three }}>
          <ThemedText type="subtitle">Choose a new password</ThemedText>
          {loading ? null : !session ? (
            <>
              <ThemedText themeColor="textSecondary">This reset link has expired or was already used. Request a new one from the sign-in page.</ThemedText>
              <Button title="Go to sign in" onPress={() => router.replace('/sign-in')} />
            </>
          ) : done ? (
            <>
              <ThemedText>Password updated. You’re signed in.</ThemedText>
              <Button title="Continue" onPress={() => router.replace('/')} />
            </>
          ) : (
            <>
              <Field label="New password" value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password"
                hint="At least 8 characters, with letters and a number" />
              <Field label="Repeat new password" value={pw2} onChangeText={setPw2} secureTextEntry autoComplete="new-password" />
              {pw2 !== '' && pw !== pw2 && <ErrorText>Passwords don’t match.</ErrorText>}
              <ErrorText>{error}</ErrorText>
              <Button title="Save password" onPress={save} loading={busy} disabled={!valid || busy} />
            </>
          )}
        </Card>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
});

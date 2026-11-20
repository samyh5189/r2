import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, ErrorText, Field } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

/** Staff sign-in: email + password, or phone OTP. No sign-up here; rate limits and lockout are enforced by Supabase Auth. */
export default function SignInScreen() {
  const [phone, setPhone] = useState('+960');
  const [code, setCode] = useState('');
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validPhone = /^\+\d{7,15}$/.test(phone.replace(/\s/g, ''));

  async function emailSignIn() {
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (error) return setError(error.message.toLowerCase().includes('invalid login') ? 'Email or password is wrong.' : error.message);
    router.replace('/');
  }

  async function sendCode() {
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithOtp({ phone: phone.replace(/\s/g, ''), options: { shouldCreateUser: false } });
    setBusy(false);
    if (error) return setError(error.message);
    setStep('code');
  }

  async function verify() {
    setBusy(true); setError(null);
    const { error } = await supabase.auth.verifyOtp({ phone: phone.replace(/\s/g, ''), token: code, type: 'sms' });
    setBusy(false);
    if (error) return setError('That code is wrong or expired.');
    router.replace('/');
  }

  return (
    <ThemedView style={styles.flex}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.body}>
          {method === 'email' ? (
            <>
              <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
                autoComplete="email" textContentType="emailAddress" autoFocus />
              <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry
                autoComplete="current-password" textContentType="password" onSubmitEditing={emailSignIn} />
              <ErrorText>{error}</ErrorText>
              <Button title="Sign in" onPress={emailSignIn} disabled={!email.trim() || !password} loading={busy} />
              <Button title="Use phone instead" variant="secondary" onPress={() => { setMethod('phone'); setError(null); }} />
            </>
          ) : step === 'phone' ? (
            <>
              <ThemedText>We will text you a 6-digit code.</ThemedText>
              <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad"
                autoComplete="tel" textContentType="telephoneNumber" autoFocus />
              <ErrorText>{error}</ErrorText>
              <Button title="Send code" onPress={sendCode} disabled={!validPhone} loading={busy} />
              <Button title="Use email instead" variant="secondary" onPress={() => { setMethod('email'); setError(null); }} />
            </>
          ) : (
            <>
              <ThemedText>Enter the code sent to {phone}.</ThemedText>
              <Field label="Code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" autoFocus />
              <ErrorText>{error}</ErrorText>
              <Button title="Verify" onPress={verify} disabled={code.length !== 6} loading={busy} />
              <Button title="Use a different number" variant="secondary" onPress={() => { setStep('phone'); setCode(''); }} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.three, gap: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
});

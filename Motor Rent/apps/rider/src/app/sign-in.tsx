import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { KenBurns, StockPhotos } from '@/components/photo';
import { SocialButtons } from '@/components/social-buttons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, ErrorText, Field } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, callFunction } from '@/lib/api';
import { useSiteSettings } from '@/lib/site';
import { supabase } from '@/lib/supabase';

type Method = 'email' | 'phone';
type EmailMode = 'signin' | 'signup';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

/** Map Supabase Auth errors to plain language. Rate limits and lockout are enforced server-side. */
function friendly(message: string) {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'Email or password is wrong.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'That email already has an account. Sign in instead.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Wait a minute and try again.';
  if (m.includes('password')) return 'Password needs at least 8 characters, with letters and numbers.';
  if (m.includes('phone') && m.includes('provider')) return 'Text-message sign-in is not switched on yet. Use email for now.';
  return message;
}


export default function SignInScreen() {
  const t = useTheme();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [method, setMethod] = useState<Method>('email');
  const [, setBusy] = useState(false);
  // WhatsApp codes appear once the owner connects WhatsApp in admin Settings.
  const whatsapp = !!useSiteSettings()?.whatsapp_ready;


  return (
    <ThemedView style={styles.flex}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <KenBurns source={StockPhotos.male} height={220} focus={{ top: '45%', left: '30%' }} />
          </View>
          <View style={styles.body}>
            <Animated.View entering={FadeInDown.duration(450)}>
              <ThemedText type="subtitle">Let’s get you riding</ThemedText>
              <ThemedText themeColor="textSecondary">Sign in to see prices, book and track your rentals.</ThemedText>
            </Animated.View>

            <SocialButtons onSignedIn={() => done(next)} onBusy={setBusy} next={next} />

            {whatsapp && <View style={[styles.segment, { backgroundColor: t.backgroundSelected }]} accessibilityRole="tablist">
              {(['email', 'phone'] as const).map((m) => (
                <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: method === m }} onPress={() => setMethod(m)}
                  style={[styles.segmentBtn, method === m && { backgroundColor: t.accent }]}>
                  <ThemedText type="smallBold" style={{ color: method === m ? t.accentText : t.textSecondary }}>
                    {m === 'email' ? 'Email' : 'WhatsApp'}
                  </ThemedText>
                </Pressable>
              ))}
            </View>}

            <Animated.View key={method} entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} layout={LinearTransition} style={styles.form}>
              {method === 'email' ? <EmailForm onBusy={setBusy} next={next} /> : <PhoneForm onBusy={setBusy} next={next} />}
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

/** After signing in: back to where the rider was (e.g. mid-booking), else the previous screen or home. */
function done(next?: string) {
  if (next && next.startsWith('/') && !next.startsWith('//')) router.replace(next as never);
  else if (router.canGoBack()) router.back();
  else router.replace('/');
}

function EmailForm({ onBusy, next }: { onBusy: (b: boolean) => void; next?: string }) {
  const [mode, setMode] = useState<EmailMode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const cleanEmail = email.trim().toLowerCase();
  const valid = EMAIL_RE.test(cleanEmail) && (mode === 'signin' ? password.length > 0 : PASSWORD_RE.test(password) && name.trim().length >= 2);

  async function submit() {
    setBusy(true); onBusy(true); setError(null); setInfo(null);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) return setError(friendly(error.message));
        return done(next);
      }
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail, password, options: { data: { full_name: name.trim() } },
      });
      if (error) return setError(friendly(error.message));
      if (data.session) return done(next);
      setInfo('Check your inbox to confirm your email, then sign in.');
      setMode('signin');
    } finally { setBusy(false); onBusy(false); }
  }

  async function forgot() {
    if (!EMAIL_RE.test(cleanEmail)) return setError('Enter your email first.');
    setError(null);
    const redirectTo = Platform.OS === 'web' ? `${window.location.origin}/reset-password` : 'motorrent://reset-password';
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo });
    setInfo(error ? null : 'If that email has an account, a reset link is on its way.');
    if (error) setError(friendly(error.message));
  }

  return (
    <>
      {mode === 'signup' && (
        <Animated.View entering={FadeInDown.duration(250)}>
          <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="As on your licence" />
        </Animated.View>
      )}
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
        autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry
        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        textContentType={mode === 'signin' ? 'password' : 'newPassword'}
        hint={mode === 'signup' ? 'At least 8 characters, with letters and numbers.' : undefined}
        onSubmitEditing={() => valid && submit()} />
      <ErrorText>{error}</ErrorText>
      {info && <ThemedText type="small" themeColor="success" accessibilityRole="alert">{info}</ThemedText>}
      <Button title={mode === 'signin' ? 'Sign in with email' : 'Create account'} onPress={submit} disabled={!valid} loading={busy} />
      <View style={styles.links}>
        <Button variant="ghost" title={mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
          onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setInfo(null); }} />
        {mode === 'signin' && <Button variant="ghost" title="Forgot password?" onPress={forgot} />}
        <Button variant="ghost" title="Booked without an account? Find your booking" onPress={() => router.push('/find')} />
      </View>
    </>
  );
}

function PhoneForm({ onBusy, next }: { onBusy: (b: boolean) => void; next?: string }) {
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const digits = phone.replace(/[^\d+]/g, '');
  const validPhone = /^\d{7}$/.test(digits) || /^\+\d{7,15}$/.test(digits);

  async function run(fn: () => Promise<void>) {
    setBusy(true); onBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.'); }
    finally { setBusy(false); onBusy(false); }
  }
  const sendCode = () => run(async () => {
    const r = await callFunction<{ phone: string }>('whatsapp-otp', { action: 'send', phone: digits, purpose: 'login' });
    setSentTo(r.phone); setCode('');
  });
  const verify = () => run(async () => {
    const r = await callFunction<{ tokenHash: string }>('whatsapp-otp', { action: 'verify', phone: sentTo!, code, purpose: 'login' });
    const { error } = await supabase.auth.verifyOtp({ token_hash: r.tokenHash, type: 'email' });
    if (error) throw new ApiError('LOGIN', 'Signing in failed. Request a new code.');
    done(next);
  });

  return !sentTo ? (
    <>
      <Field label="WhatsApp number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="7771234"
        autoComplete="tel" textContentType="telephoneNumber" hint="Maldives numbers need no prefix. Visitors: include the country code, e.g. +44." />
      <ErrorText>{error}</ErrorText>
      <Button title="Send code on WhatsApp" onPress={sendCode} disabled={!validPhone} loading={busy} />
    </>
  ) : (
    <>
      <ThemedText>We sent a 6-digit code to {sentTo} on WhatsApp. It works for 10 minutes.</ThemedText>
      <Field label="Code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus
        style={{ letterSpacing: 8, fontSize: 22, textAlign: 'center' }} />
      <ErrorText>{error}</ErrorText>
      <Button title="Sign in" onPress={verify} disabled={code.length !== 6} loading={busy} />
      <Button title="Send a new code" variant="ghost" onPress={sendCode} disabled={busy} />
      <Button title="Use a different number" variant="ghost" onPress={() => { setSentTo(null); setCode(''); }} />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingBottom: Spacing.six },
  hero: { overflow: 'hidden' },
  body: { padding: Spacing.four, gap: Spacing.three, maxWidth: 480, width: '100%', alignSelf: 'center' },
  segment: { flexDirection: 'row', borderRadius: Radius.md, padding: 4 },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: Radius.md - 4 },
  form: { gap: Spacing.three },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
});


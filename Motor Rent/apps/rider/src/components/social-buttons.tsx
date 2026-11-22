import { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, useColorScheme, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { oauthErrorMessage, signInWithProvider, type OAuthProvider } from '@/lib/oauth';

import { GoogleIdentityButton, googleIdentityAvailable } from './google-identity';
import { ThemedText } from './themed-text';
import { ErrorText, PressableScale } from './ui';

function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </Svg>
  );
}

function AppleLogo({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill={color} d="M16.37 12.6c-.02-2.24 1.83-3.32 1.91-3.37-1.04-1.52-2.66-1.73-3.24-1.75-1.38-.14-2.69.81-3.39.81-.7 0-1.78-.79-2.92-.77-1.5.02-2.89.87-3.66 2.21-1.56 2.71-.4 6.72 1.12 8.92.74 1.08 1.63 2.28 2.79 2.24 1.12-.05 1.54-.72 2.89-.72 1.35 0 1.73.72 2.91.7 1.2-.02 1.96-1.1 2.7-2.18.85-1.25 1.2-2.46 1.22-2.52-.03-.01-2.33-.9-2.35-3.56zM14.15 6.02c.62-.75 1.03-1.78.92-2.82-.89.04-1.97.59-2.6 1.34-.57.66-1.07 1.72-.94 2.73.99.08 2.01-.5 2.62-1.25z" />
    </Svg>
  );
}

const APPLE = process.env.EXPO_PUBLIC_APPLE_SIGN_IN === 'true';

/**
 * Google (and Apple once it is switched on), above the email form.
 * Google's button follows Google's branding rules (white or black with the G), so it is the one button that isn't red.
 * On the website it is Google's own button (popup on our domain); in the apps it opens the in-app browser.
 */
export function SocialButtons({ onSignedIn, onBusy, next }: { onSignedIn: () => void; onBusy?: (b: boolean) => void; next?: string }) {
  const t = useTheme();
  const dark = useColorScheme() === 'dark';
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(provider: OAuthProvider) {
    setBusy(provider); onBusy?.(true); setError(null);
    try {
      const ok = await signInWithProvider(provider, next);
      if (ok) onSignedIn();
    } catch (e) {
      setError(oauthErrorMessage(provider, e));
    } finally {
      setBusy(null); onBusy?.(false);
    }
  }

  return (
    <View style={styles.wrap}>
      {Platform.OS === 'web' && googleIdentityAvailable ? (
        <GoogleIdentityButton onSignedIn={onSignedIn} onError={setError} />
      ) : (
        <PressableScale accessibilityRole="button" accessibilityLabel="Continue with Google" disabled={!!busy} onPress={() => go('google')} lift={false}
          style={[styles.btn, dark ? styles.googleDark : styles.googleLight, busy && styles.dim]}>
          <View style={styles.icon}><GoogleG /></View>
          <ThemedText type="smallBold" style={[styles.label, { color: dark ? '#E3E3E3' : '#1F1F1F' }]}>Continue with Google</ThemedText>
          {busy === 'google' && <ActivityIndicator color={dark ? '#E3E3E3' : '#1F1F1F'} style={styles.spinner} />}
        </PressableScale>
      )}

      {APPLE && (
        <PressableScale accessibilityRole="button" accessibilityLabel="Continue with Apple" disabled={!!busy} onPress={() => go('apple')} lift={false}
          style={[styles.btn, { backgroundColor: dark ? '#FFFFFF' : '#000000' }, busy && styles.dim]}>
          <View style={styles.icon}><AppleLogo color={dark ? '#000000' : '#FFFFFF'} /></View>
          <ThemedText type="smallBold" style={[styles.label, { color: dark ? '#000000' : '#FFFFFF' }]}>Continue with Apple</ThemedText>
          {busy === 'apple' && <ActivityIndicator color={dark ? '#000000' : '#FFFFFF'} style={styles.spinner} />}
        </PressableScale>
      )}

      <ErrorText>{error}</ErrorText>

      <View style={styles.divider}>
        <View style={[styles.rule, { backgroundColor: t.border }]} />
        <ThemedText type="small" themeColor="textSecondary">or use email</ThemedText>
        <View style={[styles.rule, { backgroundColor: t.border }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two + 2 },
  btn: { minHeight: 48, borderRadius: Radius.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.four, gap: Spacing.two + 2 },
  googleLight: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#747775' },
  googleDark: { backgroundColor: '#131314', borderWidth: 1, borderColor: '#8E918F' },
  icon: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15 },
  spinner: { position: 'absolute', right: 16 },
  dim: { opacity: 0.6 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.two },
  rule: { flex: 1, height: 1 },
});

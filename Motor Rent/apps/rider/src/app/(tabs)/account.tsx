import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Image } from 'expo-image';

import { StockPhotos } from '@/components/photo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, Pill } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing, TopNavInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Profile = { full_name: string | null; phone: string | null; kyc_status: 'pending' | 'approved' | 'rejected'; licence_expires_on: string | null };

const SUPPORT_PHONE = '+9600000000'; // TODO: real support / breakdown line

export default function AccountScreen() {
  const { session } = useSession();
  const t = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);

  useFocusEffect(useCallback(() => {
    if (!session) return;
    supabase.from('profiles').select('full_name, phone, kyc_status, licence_expires_on').eq('id', session.user.id).single()
      .then(({ data }) => setProfile(data as Profile | null));
  }, [session]));

  if (!session) {
    return (
      <ThemedView style={[styles.flex, styles.center]}>
        <Animated.View entering={FadeInDown.duration(500)} style={styles.signedOut}>
          <View style={[styles.badge, { borderColor: t.border }]}>
            <Image source={StockPhotos.scooter} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} />
          </View>
          <ThemedText type="heading" style={{ textAlign: 'center' }}>Your rider profile</ThemedText>
          <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
            Sign in to verify your licence once and book any bike in seconds.
          </ThemedText>
          <Button title="Sign in or create account" onPress={() => router.push('/sign-in')} />
        </Animated.View>
      </ThemedView>
    );
  }

  const status = profile?.kyc_status ?? 'pending';
  const kyc = {
    pending: { pill: 'Not verified', tone: 'warning' as const, text: 'Upload your driving licence, ID and a selfie. We review within 1 hour during opening times.' },
    approved: { pill: 'Verified', tone: 'success' as const, text: `Licence valid until ${profile?.licence_expires_on ?? '—'}.` },
    rejected: { pill: 'Needs attention', tone: 'danger' as const, text: 'Verification failed. Please re-upload clear photos or visit the counter.' },
  }[status];

  const name = profile?.full_name || session.user.user_metadata?.full_name || 'Rider';
  const contact = session.user.email ?? profile?.phone ?? session.user.phone ?? '';
  const initials = String(name).split(/\s+/).map((p: string) => p[0]).join('').slice(0, 2).toUpperCase();

  function deleteAccount() {
    const run = () => Linking.openURL('mailto:privacy@example.com?subject=Delete%20my%20account'); // TODO: delete-account Edge Function
    if (Platform.OS === 'web') return run();
    Alert.alert('Delete account?', 'Your account and documents will be deleted. Open rentals must be closed first.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: run },
    ]);
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.body}>
          <Animated.View entering={FadeInDown.duration(400)}>
            <ThemedText type="subtitle">Account</ThemedText>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80).duration(450)}>
            <Card style={styles.profile}>
              <View style={[styles.avatar, { backgroundColor: t.accent }]}>
                <ThemedText type="heading" style={{ color: t.accentText }}>{initials || 'R'}</ThemedText>
              </View>
              <View style={styles.flex}>
                <ThemedText type="heading">{name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{contact}</ThemedText>
              </View>
            </Card>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(160).duration(450)}>
            <Card>
              <View style={styles.row}>
                <ThemedText type="heading" style={styles.flex}>Identity check</ThemedText>
                <Pill label={kyc.pill} tone={kyc.tone} />
              </View>
              <ThemedText type="small">{kyc.text}</ThemedText>
              <Steps done={status === 'approved' ? 3 : 0} />
              {/* TODO: KYC upload flow → private `kyc/<uid>/` bucket + kyc_documents rows */}
            </Card>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(240).duration(450)} style={{ gap: Spacing.two }}>
            <Button title="Call breakdown / emergency line" variant="secondary" onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)} />
            <Button title="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
            <Button title="Delete my account" variant="ghost" onPress={deleteAccount} />
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Steps({ done }: { done: number }) {
  const t = useTheme();
  const steps = ['Licence', 'ID card', 'Selfie'];
  return (
    <View style={styles.steps}>
      {steps.map((s, i) => {
        const ok = i < done;
        return (
          <View key={s} style={[styles.step, { borderColor: ok ? t.success : t.border, backgroundColor: ok ? t.successSoft : 'transparent' }]}>
            <ThemedText type="smallBold" style={{ color: ok ? t.success : t.textSecondary }}>{ok ? '✓ ' : `${i + 1}. `}{s}</ThemedText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: Spacing.four, paddingTop: TopNavInset },
  signedOut: { alignItems: 'center', gap: Spacing.three, maxWidth: 380, width: '100%' },
  badge: { width: 200, height: 200, borderRadius: 100, overflow: 'hidden', borderWidth: 1 },
  body: {
    padding: Spacing.three, paddingTop: TopNavInset + Spacing.three, paddingBottom: BottomTabInset + Spacing.five,
    gap: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center',
  },
  profile: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
  step: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
});

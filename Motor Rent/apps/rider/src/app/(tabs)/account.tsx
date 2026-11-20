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
import { ApiError, callFunction } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useSiteSettings } from '@/lib/site';
import { supabase } from '@/lib/supabase';

type Profile = { full_name: string | null; phone: string | null; kyc_status: 'pending' | 'approved' | 'rejected'; licence_expires_on: string | null };


export default function AccountScreen() {
  const { session } = useSession();
  const t = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [submission, setSubmission] = useState<{ status: 'pending' | 'approved' | 'rejected'; note: string | null } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const site = useSiteSettings();

  useFocusEffect(useCallback(() => {
    if (!session) return;
    supabase.from('profiles').select('full_name, phone, kyc_status, licence_expires_on').eq('id', session.user.id).single()
      .then(({ data }) => setProfile(data as Profile | null));
    supabase.from('kyc_submissions').select('status, note').eq('profile_id', session.user.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setSubmission(data as typeof submission));
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

  const expired = !!profile?.licence_expires_on && new Date(profile.licence_expires_on) <= new Date();
  const status: 'none' | 'review' | 'approved' | 'rejected' | 'expired' =
    profile?.kyc_status === 'approved' ? (expired ? 'expired' : 'approved')
      : submission?.status === 'pending' ? 'review'
        : submission?.status === 'rejected' ? 'rejected' : 'none';
  const kyc = {
    none: { pill: 'Not verified', tone: 'warning' as const, text: 'Upload your driving licence, ID and a selfie once. We review within about an hour during opening times.', cta: 'Verify my identity' },
    review: { pill: 'Under review', tone: 'warning' as const, text: 'Thanks! We’re checking your documents. You can book as soon as you’re verified.', cta: null },
    approved: { pill: 'Verified', tone: 'success' as const, text: `Licence valid until ${profile?.licence_expires_on ?? '—'}.`, cta: null },
    rejected: { pill: 'Needs attention', tone: 'danger' as const, text: submission?.note ?? 'Verification failed. Please upload clear photos again.', cta: 'Upload again' },
    expired: { pill: 'Licence expired', tone: 'danger' as const, text: 'Your licence on file has expired. Upload your renewed licence to keep booking.', cta: 'Update documents' },
  }[status];

  const name = profile?.full_name || session.user.user_metadata?.full_name || 'Rider';
  const contact = session.user.email ?? profile?.phone ?? session.user.phone ?? '';
  const initials = String(name).split(/\s+/).map((p: string) => p[0]).join('').slice(0, 2).toUpperCase();

  function deleteAccount() {
    const run = async () => {
      setDeleteError(null);
      try {
        await callFunction('delete-account', {});
        await supabase.auth.signOut();
        router.replace('/');
      } catch (e) {
        setDeleteError(e instanceof ApiError ? e.message : 'Could not delete your account. Please try again.');
      }
    };
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm('Delete your account? Your identity documents are erased and you are signed out. This cannot be undone.')) run();
      return;
    }
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
              <Steps done={status === 'approved' ? 3 : status === 'review' ? 3 : 0} />
              {kyc.cta && <Button title={kyc.cta} onPress={() => router.push('/verify')} />}
            </Card>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(240).duration(450)} style={{ gap: Spacing.two }}>
            {site?.support_phone && (
              <Button title={`Call us · ${site.support_phone}`} variant="secondary" onPress={() => Linking.openURL(`tel:${site.support_phone!.replace(/\s/g, '')}`)} />
            )}
            {site?.support_email && (
              <Button title={`Email ${site.support_email}`} variant="secondary" onPress={() => Linking.openURL(`mailto:${site.support_email}`)} />
            )}
            <Button title="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
            <Button title="Delete my account" variant="ghost" onPress={deleteAccount} />
            {deleteError && <ThemedText type="small" style={{ color: t.danger, textAlign: 'center' }}>{deleteError}</ThemedText>}
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

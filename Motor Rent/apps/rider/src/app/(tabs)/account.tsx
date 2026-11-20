import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Image } from 'expo-image';

import { Avatar } from '@/components/avatar';
import { StockPhotos } from '@/components/photo';
import { useWebPullToRefresh } from '@/components/pull-to-refresh';
import { WhatsAppCard } from '@/components/whatsapp-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, Pill, PressableScale } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing, TopNavInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, callFunction } from '@/lib/api';
import { changeAvatar, removeAvatar } from '@/lib/avatar';
import { useSession } from '@/lib/session';
import { useSiteSettings } from '@/lib/site';
import { supabase } from '@/lib/supabase';

type Profile = { avatar_path: string | null; full_name: string | null; phone: string | null; kyc_status: 'pending' | 'approved' | 'rejected'; licence_expires_on: string | null; whatsapp: string | null; whatsapp_verified: boolean };


export default function AccountScreen() {
  const { session } = useSession();
  const t = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [submission, setSubmission] = useState<{ status: 'pending' | 'approved' | 'rejected'; note: string | null } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const site = useSiteSettings();

  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const [p, k] = await Promise.all([
      supabase.from('profiles').select('avatar_path, full_name, phone, kyc_status, licence_expires_on, whatsapp, whatsapp_verified').eq('id', session.user.id).single(),
      supabase.from('kyc_submissions').select('status, note').eq('profile_id', session.user.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setProfile(p.data as Profile | null);
    setSubmission(k.data as typeof submission);
  }, [session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const pull = useWebPullToRefresh(load);
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  async function photo(action: 'library' | 'camera' | 'remove') {
    if (!session || !profile) return;
    setPhotoBusy(true); setPhotoError(null);
    try {
      if (action === 'remove') {
        if (profile.avatar_path) await removeAvatar(session.user.id, profile.avatar_path);
        setProfile({ ...profile, avatar_path: null });
      } else {
        const path = await changeAvatar(session.user.id, profile.avatar_path, action === 'camera');
        if (path) setProfile({ ...profile, avatar_path: path });
      }
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally { setPhotoBusy(false); }
  }
  function photoMenu() {
    if (Platform.OS === 'web') return photo('library');
    Alert.alert('Profile photo', undefined, [
      { text: 'Take photo', onPress: () => photo('camera') },
      { text: 'Choose from library', onPress: () => photo('library') },
      ...(profile?.avatar_path ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: () => photo('remove') }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  if (!session) {
    return (
      <ThemedView style={[styles.flex, styles.center]}>
        <Animated.View style={styles.signedOut}>
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
        {pull.indicator}
        <ScrollView ref={pull.ref} contentContainerStyle={styles.body}
          refreshControl={Platform.OS !== 'web' ? <RefreshControl refreshing={refreshing} onRefresh={refresh} /> : undefined}>
          <Animated.View>
            <ThemedText type="subtitle">Account</ThemedText>
          </Animated.View>

          <Animated.View>
            <Card style={styles.profile}>
              <PressableScale onPress={photoMenu} disabled={photoBusy || !profile} accessibilityRole="button"
                accessibilityLabel={profile?.avatar_path ? 'Change profile photo' : 'Add profile photo'} scaleTo={0.94} lift={false}>
                <Avatar path={profile?.avatar_path} name={name} size={64} />
                <View style={[styles.camBadge, { backgroundColor: t.accent, borderColor: t.backgroundElement }]}>
                  {photoBusy ? <ActivityIndicator size="small" color={t.accentText} /> : <ThemedText style={{ color: t.accentText, fontSize: 13, lineHeight: 16, fontWeight: '700' }}>{profile?.avatar_path ? '✎' : '+'}</ThemedText>}
                </View>
              </PressableScale>
              <View style={[styles.flex, { gap: 2 }]}>
                <ThemedText type="heading">{name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{contact}</ThemedText>
                <View style={{ flexDirection: 'row', gap: Spacing.three }}>
                  <ThemedText type="smallBold" style={{ color: t.accent }} onPress={photoMenu}>{profile?.avatar_path ? 'Change photo' : 'Add a photo'}</ThemedText>
                  {Platform.OS === 'web' && profile?.avatar_path && (
                    <ThemedText type="small" themeColor="textSecondary" onPress={() => photo('remove')}>Remove</ThemedText>
                  )}
                </View>
                {photoError && <ThemedText type="small" style={{ color: t.danger }}>{photoError}</ThemedText>}
              </View>
            </Card>
          </Animated.View>

          <Animated.View>
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

          {session && profile && (
            <WhatsAppCard userId={session.user.id} number={profile.whatsapp} verified={profile.whatsapp_verified}
              ready={!!site?.whatsapp_ready} onSaved={load} />
          )}

          <Animated.View style={{ gap: Spacing.two }}>
            {site?.support_phone && (
              <Button title="Message us on WhatsApp" variant="secondary"
                onPress={() => Linking.openURL(`https://wa.me/${site.support_phone!.replace(/\D/g, '').replace(/^(\d{7})$/, '960$1')}`)} />
            )}
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
  camBadge: { position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
  step: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
});

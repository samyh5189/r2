import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Profile = { full_name: string | null; phone: string | null; kyc_status: 'pending' | 'approved' | 'rejected'; licence_expires_on: string | null };

const SUPPORT_PHONE = '+9600000000'; // TODO: real support / breakdown line

export default function AccountScreen() {
  const { session } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);

  useFocusEffect(useCallback(() => {
    if (!session) return;
    supabase.from('profiles').select('full_name, phone, kyc_status, licence_expires_on').eq('id', session.user.id).single()
      .then(({ data }) => setProfile(data as Profile | null));
  }, [session]));

  if (!session) {
    return (
      <ThemedView style={[styles.flex, styles.center]}>
        <ThemedText>Sign in to manage your account.</ThemedText>
        <Button title="Sign in" onPress={() => router.push('/sign-in')} />
      </ThemedView>
    );
  }

  const kycText = {
    pending: 'Upload your driving licence, ID and a selfie. We review within 1 hour during opening times.',
    approved: `Verified. Licence valid until ${profile?.licence_expires_on ?? '—'}.`,
    rejected: 'Verification failed. Please re-upload clear photos or visit the counter.',
  }[profile?.kyc_status ?? 'pending'];

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
          <ThemedText type="subtitle">Account</ThemedText>
          <Card>
            <ThemedText type="smallBold">{profile?.full_name ?? 'Rider'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{profile?.phone ?? session.user.phone}</ThemedText>
          </Card>
          <Card>
            <ThemedText type="smallBold">Identity verification</ThemedText>
            <ThemedText type="small">{kycText}</ThemedText>
            {/* TODO: KYC upload flow → private `kyc/<uid>/` bucket + kyc_documents rows */}
          </Card>
          <Button title="Call breakdown / emergency line" variant="secondary" onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)} />
          <Button title="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
          <Button title="Delete my account" variant="secondary" onPress={deleteAccount} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  body: { padding: Spacing.three, paddingBottom: BottomTabInset + Spacing.four, gap: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
});

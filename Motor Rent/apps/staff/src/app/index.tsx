import { normPhone } from '@motor-rent/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, ErrorText, Field } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

/** Staff look up a booking by its 8-character reference or the rider's phone number. */
export default function LookupScreen() {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTheme();
  const { session } = useSession();
  const first = String(session?.user.user_metadata?.full_name ?? session?.user.user_metadata?.name ?? '').split(' ')[0];
  const [greeting] = useState(() => {
    const h = new Date(Date.now() + 5 * 3_600_000).getUTCHours(); // Maldives time
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  });

  async function find() {
    setBusy(true); setError(null);
    const q = query.trim().toUpperCase();
    let ref: string | null = null;
    const phone = normPhone(q);
    if (phone && !/^[0-9A-F]{8}$/.test(q)) {
      // The rider's account number, or the number a booking without an account was made with.
      const [acc, guest] = await Promise.all([
        supabase.from('bookings').select('reference, created_at, profiles!bookings_rider_id_fkey!inner(phone)').eq('profiles.phone', phone)
          .in('status', ['confirmed', 'active', 'overdue']).order('created_at', { ascending: false }).limit(1),
        supabase.from('bookings').select('reference, created_at').eq('guest_phone', phone)
          .in('status', ['confirmed', 'active', 'overdue']).order('created_at', { ascending: false }).limit(1),
      ]);
      const hits = [...(acc.data ?? []), ...(guest.data ?? [])] as { reference: string; created_at: string }[];
      ref = hits.sort((x, y) => y.created_at.localeCompare(x.created_at))[0]?.reference ?? null;
    } else {
      const { data } = await supabase.from('bookings').select('reference').eq('reference', q).maybeSingle();
      ref = data?.reference ?? null;
    }
    setBusy(false);
    if (!ref) return setError('No matching booking at your branch.');
    router.push({ pathname: '/booking/[ref]', params: { ref } });
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <View style={[styles.mark, { backgroundColor: t.accent }]}><ThemedText style={styles.markText}>ER</ThemedText></View>
            <Pressable accessibilityRole="button" onPress={() => supabase.auth.signOut()}
              style={[styles.pill, { borderColor: t.border, backgroundColor: t.backgroundElement }]}>
              <ThemedText type="smallBold">Sign out</ThemedText>
            </Pressable>
          </View>
          <View>
            <ThemedText type="small" themeColor="textSecondary">{greeting}{first ? `, ${first}` : ''} 👋</ThemedText>
            <ThemedText type="subtitle">Find booking</ThemedText>
          </View>

          <View style={[styles.hero, { backgroundColor: t.accent }]}>
            <View style={[styles.blob, { right: -40, top: -50, backgroundColor: t.violet }]} />
            <View style={[styles.blob, { right: 40, bottom: -70, width: 120, height: 120, backgroundColor: '#ffffff22' }]} />
            <ThemedText type="smallBold" style={{ color: '#ffffffd0' }}>Pickup and return</ThemedText>
            <ThemedText style={styles.heroTitle}>Scan the rider in, hand over the keys.</ThemedText>
            <ThemedText type="small" style={{ color: '#ffffffc0' }}>Inspect, take the 6 photos, sign, done.</ThemedText>
          </View>

          <Card style={{ gap: Spacing.three }}>
            <Field label="Booking reference or rider phone" value={query} onChangeText={setQuery}
              autoCapitalize="characters" autoCorrect={false} onSubmitEditing={find} placeholder="e.g. 30CE5E3F or 7xxxxxx" />
            <ErrorText>{error}</ErrorText>
            <Button title="Find" onPress={find} disabled={query.trim().length < 6} loading={busy} />
          </Card>
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            {/* TODO: QR scan of the booking code with expo-camera */}
            Tip: the reference is on the rider&apos;s confirmation SMS and email.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.three + 4, gap: Spacing.three + 4, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mark: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  markText: { color: '#fff', fontWeight: 800, fontSize: 15, lineHeight: 18 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, minHeight: 40, justifyContent: 'center' },
  hero: { borderRadius: 26, padding: 22, gap: 6, overflow: 'hidden', minHeight: 150, justifyContent: 'flex-end' },
  blob: { position: 'absolute', width: 180, height: 180, borderRadius: 999, opacity: 0.55 },
  heroTitle: { color: '#fff', fontSize: 24, lineHeight: 30, fontWeight: 800, maxWidth: '85%' },
});

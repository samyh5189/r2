import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, ErrorText, Field } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

/** Staff look up a booking by its 8-character reference or the rider's phone number. */
export default function LookupScreen() {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function find() {
    setBusy(true); setError(null);
    const q = query.trim().toUpperCase();
    let ref: string | null = null;
    if (/^\+?\d{7,15}$/.test(q)) {
      const { data } = await supabase.from('bookings')
        .select('reference, profiles!inner(phone)').eq('profiles.phone', q.startsWith('+') ? q : `+${q}`)
        .in('status', ['confirmed', 'active', 'overdue']).order('created_at', { ascending: false }).limit(1);
      ref = (data?.[0] as { reference: string } | undefined)?.reference ?? null;
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
      <View style={styles.body}>
        <Field label="Booking reference or rider phone" value={query} onChangeText={setQuery}
          autoCapitalize="characters" autoCorrect={false} onSubmitEditing={find} />
        <ErrorText>{error}</ErrorText>
        <Button title="Find" onPress={find} disabled={query.trim().length < 6} loading={busy} />
        <ThemedText type="small" themeColor="textSecondary">
          {/* TODO: QR scan of the booking code with expo-camera */}
          Tip: the reference is on the rider's confirmation SMS and email.
        </ThemedText>
        <Button title="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.three, gap: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
});

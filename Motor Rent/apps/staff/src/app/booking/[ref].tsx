import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, ErrorText } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { StaffBooking } from '@/lib/api';
import { dateTime, money, parseRange } from '@/lib/format';
import { supabase } from '@/lib/supabase';

export default function BookingScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const t = useTheme();
  const [b, setB] = useState<StaffBooking | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    supabase.from('bookings')
      .select('id, reference, status, period, total, deposit, currency, vehicles(make, model, plate, odometer_km, engine_hours), profiles(full_name, phone, kyc_status, licence_expires_on)')
      .eq('reference', ref).single()
      .then(({ data, error }) => { setB(data as unknown as StaffBooking); setError(error ? 'Could not load booking.' : null); });
  }, [ref]));

  if (!b) return <ThemedView style={[styles.flex, styles.body]}><ErrorText>{error}</ErrorText></ThemedView>;

  const range = parseRange(b.period);
  const kycOk = b.profiles?.kyc_status === 'approved'
    && !!b.profiles.licence_expires_on && range && new Date(b.profiles.licence_expires_on) >= range.end;
  const canPickup = b.status === 'confirmed' && kycOk;
  const canReturn = b.status === 'active' || b.status === 'overdue';

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.body}>
        <ThemedText type="subtitle">{b.reference}</ThemedText>
        <Card>
          <ThemedText type="smallBold">{b.vehicles?.make} {b.vehicles?.model} · {b.vehicles?.plate}</ThemedText>
          {range && <ThemedText type="small">{dateTime(range.start)} → {dateTime(range.end)}</ThemedText>}
          <ThemedText type="small">Status: {b.status}</ThemedText>
          <ThemedText type="small">Paid {money(b.total, b.currency)} · Deposit {money(b.deposit, b.currency)}</ThemedText>
        </Card>
        <Card>
          <ThemedText type="smallBold">{b.profiles?.full_name ?? 'Rider'} · {b.profiles?.phone}</ThemedText>
          <ThemedText type="small" style={{ color: kycOk ? t.success : t.danger }}>
            {kycOk ? `ID verified · licence valid to ${b.profiles?.licence_expires_on}` : 'ID NOT verified or licence expires during rental — do not hand over keys'}
          </ThemedText>
        </Card>
        <View style={{ gap: Spacing.two }}>
          {b.status === 'confirmed' && (
            <Button title="Start pickup inspection" disabled={!canPickup}
              onPress={() => router.push({ pathname: '/inspection/[id]', params: { id: b.id, phase: 'pickup', odo: String(b.vehicles?.odometer_km ?? 0), hrs: String(b.vehicles?.engine_hours ?? '') } })} />
          )}
          {canReturn && (
            <Button title="Start return inspection"
              onPress={() => router.push({ pathname: '/inspection/[id]', params: { id: b.id, phase: 'return', odo: String(b.vehicles?.odometer_km ?? 0), hrs: String(b.vehicles?.engine_hours ?? '') } })} />
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.three, gap: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
});

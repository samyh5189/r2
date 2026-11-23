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
      .select('id, reference, status, period, total, deposit, currency, guest_name, guest_phone, handover, delivery_address, counter_licence_categories, counter_licence_expires_on, vehicles(kind, make, model, plate, odometer_km, engine_hours), profiles!bookings_rider_id_fkey(full_name, phone, kyc_status, licence_expires_on, licence_categories)')
      .eq('reference', ref).single()
      .then(({ data, error }) => { setB(data as unknown as StaffBooking); setError(error ? 'Could not load booking.' : null); });
  }, [ref]));

  if (!b) return <ThemedView style={[styles.flex, styles.body]}><ErrorText>{error}</ErrorText></ThemedView>;

  const range = parseRange(b.period);
  // Licence category this vehicle needs (A two-wheelers, B cars): verified on the account, or checked at the counter.
  const need = b.vehicles?.kind === 'car' ? 'B' : 'A';
  const endDay = range ? range.end.toISOString().slice(0, 10) : '';
  const accountOk = b.profiles?.kyc_status === 'approved' && !!b.profiles.licence_expires_on && b.profiles.licence_expires_on >= endDay
    && (b.profiles.licence_categories ?? []).includes(need);
  const counterOk = (b.counter_licence_categories ?? []).includes(need) && !!b.counter_licence_expires_on && b.counter_licence_expires_on >= endDay;
  const kycOk = !!range && (accountOk || counterOk);
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
          <ThemedText type="smallBold">{b.profiles?.full_name ?? b.guest_name ?? 'Rider'} · {b.profiles?.phone ?? b.guest_phone}{b.profiles ? '' : ' · no account'}</ThemedText>
          {b.handover === 'delivery' && <ThemedText type="small">Delivery to {b.delivery_address}</ThemedText>}
          <ThemedText type="small" style={{ color: kycOk ? t.success : t.danger }}>
            {accountOk ? `ID verified · licence valid to ${b.profiles?.licence_expires_on}`
              : counterOk ? `Licence checked at the counter (${(b.counter_licence_categories ?? []).join(', ')}) · valid to ${b.counter_licence_expires_on}`
              : `Licence not checked for category ${need}: record the check on the booking in the admin before handing over keys`}
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

import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar, Button, Card, Chip, ErrorText, InfoRow } from '@/components/ui';
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
        <View style={styles.head}>
          <Avatar name={b.profiles?.full_name ?? b.guest_name ?? 'Rider'} size={72} />
          <View style={{ flex: 1, gap: 6 }}>
            <ThemedText style={styles.name}>{b.profiles?.full_name ?? b.guest_name ?? 'Rider'}</ThemedText>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <Chip label={b.status.replace('_', ' ')} tone={b.status === 'overdue' ? 'danger' : b.status === 'active' ? 'success' : b.status === 'confirmed' ? 'accent' : 'neutral'} />
              {!b.profiles && <Chip label="No account" tone="warning" />}
              {b.handover === 'delivery' && <Chip label="Delivery" tone="accent" />}
            </View>
            <ThemedText type="small" themeColor="textSecondary">Booking {b.reference}</ThemedText>
          </View>
        </View>
        <Card style={{ gap: 0, paddingVertical: Spacing.one }}>
          <InfoRow label="Phone">{b.profiles?.phone ?? b.guest_phone ?? '—'}</InfoRow>
          <InfoRow label="Vehicle">{`${b.vehicles?.make ?? ''} ${b.vehicles?.model ?? ''} · ${b.vehicles?.plate ?? ''}`}</InfoRow>
          {range && <InfoRow label="From">{dateTime(range.start)}</InfoRow>}
          {range && <InfoRow label="To">{dateTime(range.end)}</InfoRow>}
          {b.handover === 'delivery' && <InfoRow label="Deliver to">{b.delivery_address ?? '—'}</InfoRow>}
          <InfoRow label="Paid">{money(b.total, b.currency)}</InfoRow>
          <InfoRow label="Deposit" last>{money(b.deposit, b.currency)}</InfoRow>
        </Card>
        <Card style={{ backgroundColor: kycOk ? t.successSoft : t.dangerSoft, borderColor: 'transparent' }}>
          <ThemedText type="smallBold" style={{ color: kycOk ? t.success : t.danger }}>{kycOk ? 'Licence OK' : 'Licence not checked'}</ThemedText>
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
  body: { padding: Spacing.three + 4, gap: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  name: { fontSize: 24, lineHeight: 30, fontWeight: 800, letterSpacing: -0.3 },
});

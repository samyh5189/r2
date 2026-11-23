import { normPhone, phoneLabel } from '@motor-rent/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BikeImage, type VehicleKind } from '@/components/photo';
import { ThemedText } from '@/components/themed-text';
import { TransferPayment } from '@/components/transfer-payment';
import { ViberButton } from '@/components/viber-button';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, ErrorText, Field, Pill } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, callFunction } from '@/lib/api';
import { STATUS } from '@/lib/booking-status';
import { dateTime, money, parseRange } from '@/lib/format';

type Found = {
  id: string; slip: { status: 'pending' | 'approved' | 'rejected'; reject_reason: string | null; created_at: string } | null;
  reference: string; status: string; period: string; total: number; currency: 'MVR' | 'USD'; held_until: string | null;
  handover: 'counter' | 'delivery'; delivery_address: string | null; guest_name: string; linked: boolean; viber_token: string;
  vehicles: { make: string; model: string; plate: string; kind: VehicleKind } | null; branches: { name: string } | null;
};

/** A booking made without an account, found by its reference and the mobile number it was made with. */
export default function FindBooking() {
  const t = useTheme();
  const params = useLocalSearchParams<{ ref?: string; phone?: string }>();
  const [ref, setRef] = useState(params.ref ?? '');
  const [phone, setPhone] = useState(params.phone ? phoneLabel(params.phone) : '');
  const [found, setFound] = useState<Found | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mobile = normPhone(phone);
  const reference = ref.trim().toUpperCase();
  const ready = /^[0-9A-F]{8}$/.test(reference) && !!mobile;

  async function look() {
    if (!ready) return;
    setBusy(true); setError(null); setFound(null);
    try {
      const r = await callFunction<{ booking: Found }>('guest-booking', { action: 'lookup', reference, phone: mobile });
      setFound(r.booking);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not look that up.');
    } finally { setBusy(false); }
  }
  // Arriving from the confirmation screen: show it straight away (once).
  useEffect(() => {
    if (!params.ref || !params.phone) return;
    const id = setTimeout(look, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const r = found ? parseRange(found.period) : null;
  const s = found ? STATUS[found.status] ?? { label: found.status, tone: 'neutral' as const } : null;
  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="subtitle">Find my booking</ThemedText>
          <ThemedText themeColor="textSecondary">For bookings made without an account. Use the reference we gave you and the mobile number you booked with.</ThemedText>
        </View>
        <Card style={{ gap: Spacing.three }}>
          <Field label="Booking reference" value={ref} onChangeText={setRef} placeholder="E5B0972F" autoCapitalize="characters" maxLength={8} />
          <Field label="Mobile number" value={phone} onChangeText={setPhone} placeholder="777 1234" keyboardType="phone-pad" autoComplete="tel" />
          <Button title="Find booking" onPress={look} disabled={!ready} loading={busy} />
          <ErrorText>{error}</ErrorText>
        </Card>
        {found && r && s && (
          <Card style={{ gap: Spacing.three }}>
            {found.vehicles && <View style={styles.pic}><BikeImage vehicle={found.vehicles} style={StyleSheet.absoluteFill} /></View>}
            <View style={styles.row}>
              <ThemedText type="heading">{found.vehicles ? `${found.vehicles.make} ${found.vehicles.model}` : 'Your ride'}</ThemedText>
              <Pill label={s.label} tone={s.tone} />
            </View>
            <ThemedText>Pickup {dateTime(r.start)}{'\n'}Return by {dateTime(r.end)}</ThemedText>
            <ThemedText themeColor="textSecondary">
              {found.handover === 'delivery' ? `Delivery to ${found.delivery_address}.` : `Pickup at ${found.branches?.name ?? 'our counter'}.`} Total {money(found.total, found.currency)}.
            </ThemedText>
            {found.status === 'held' && (
              <ThemedText style={{ color: t.warning }}>
                Not paid yet. Pay by transfer and upload the slip below, or we’ll call you{found.held_until ? `; we hold it until ${dateTime(new Date(found.held_until))}` : ''}.
              </ThemedText>
            )}
            {found.status === 'expired' && <ThemedText themeColor="textSecondary">The hold ran out before payment. Book again, or call us.</ThemedText>}
            {found.status === 'held' && mobile && <TransferPayment booking={found} guest={{ phone: mobile }} onChange={look} />}
            {['held', 'confirmed', 'active', 'overdue'].includes(found.status) && <ViberButton code={found.viber_token} />}
            {found.linked ? (
              <Button variant="secondary" title="Open in my account" onPress={() => router.push('/bookings')} />
            ) : (
              <ThemedText type="small" themeColor="textSecondary">Create an account and verify it with this mobile number to keep your rentals in one place.</ThemedText>
            )}
          </Card>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.three, gap: Spacing.four, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', paddingBottom: Spacing.six },
  pic: { height: 180, borderRadius: Radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
});

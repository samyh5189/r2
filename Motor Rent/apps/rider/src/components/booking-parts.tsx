import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { BikeImage, type VehicleKind } from '@/components/photo';
import { CancelBooking } from '@/components/cancel-booking';
import { DateTimePicker } from '@/components/date-time-picker';
import { ThemedText } from '@/components/themed-text';
import { TransferPayment } from '@/components/transfer-payment';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, PressableScale } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CreateBookingResponse } from '@/lib/api';
import { dateTime } from '@/lib/format';

export const DURATIONS = [
  { label: '2 hours', hours: 2 },
  { label: '4 hours', hours: 4 },
  { label: '1 day', hours: 24 },
  { label: '3 days', hours: 72 },
  { label: '1 week', hours: 168 },
];
export const MIN_RENTAL_HOURS = 1;
export const MAX_RENTAL_DAYS = 30;


export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} scaleTo={0.93} lift={false}
      style={[styles.chip, {
        borderColor: selected ? t.accent : t.border,
        backgroundColor: selected ? t.accent : t.backgroundElement,
      }]}>
      <ThemedText type="smallBold" style={{ color: selected ? t.accentText : t.text }}>{label}</ThemedText>
    </PressableScale>
  );
}

export const lengthLabel = (h: number) =>
  h < 24 ? `${h} h` : `${Math.floor(h / 24)} day${h >= 48 ? 's' : ''}${h % 24 ? ` ${h % 24} h` : ''}`;

/** Pickup and return on one card. Each opens its own day/time picker; length buttons set the return in one tap. */
export function TripPlanner({ start, end, earliest, minEnd, hours, onStart, onEnd, onLength }: {
  start: Date; end: Date; earliest: Date; minEnd: Date; hours: number;
  onStart: (d: Date) => void; onEnd: (d: Date) => void; onLength: (h: number) => void;
}) {
  const t = useTheme();
  const [open, setOpen] = useState<'start' | 'end' | null>(null);
  const toggle = (k: 'start' | 'end') => setOpen((o) => (o === k ? null : k));
  const row = (k: 'start' | 'end', label: string, value: Date, dot: string) => (
    <Pressable onPress={() => toggle(k)} accessibilityRole="button" accessibilityState={{ expanded: open === k }}
      accessibilityLabel={`${label}: ${dateTime(value)}. ${open === k ? 'Close' : 'Change'}`} style={styles.tripRow}>
      <View style={[styles.tripDot, { backgroundColor: dot }]} />
      <View style={styles.flex}>
        <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
        <ThemedText type="smallBold" style={{ fontSize: 17, lineHeight: 22 }}>{dateTime(value)}</ThemedText>
      </View>
      <ThemedText type="smallBold" style={{ color: t.accent }}>{open === k ? 'Done' : 'Change'}</ThemedText>
    </Pressable>
  );
  return (
    <Card style={{ gap: Spacing.two }}>
      {row('start', 'Pickup', start, t.success)}
      {open === 'start' && <DateTimePicker value={start} onChange={onStart} min={earliest} days={MAX_RENTAL_DAYS} />}
      <View style={[styles.lengthRow, { borderColor: t.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {DURATIONS.map((d) => {
            const sel = d.hours === hours;
            return (
              <Pressable key={d.label} onPress={() => onLength(d.hours)} accessibilityRole="radio" accessibilityState={{ selected: sel }}
                style={[styles.lengthChip, { borderColor: sel ? t.accent : t.border, backgroundColor: sel ? t.accent : 'transparent' }]}>
                <ThemedText type="smallBold" style={{ color: sel ? t.accentText : t.text, fontSize: 13 }}>{d.label}</ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {row('end', `Return by, ${lengthLabel(hours)} rental`, end, t.accent)}
      {open === 'end' && <DateTimePicker value={end} onChange={onEnd} min={minEnd} days={MAX_RENTAL_DAYS + 1} />}
    </Card>
  );
}

/** Success: the vehicle photo with a confirmation check popping in. */
export function Reserved({ booking, bankTransfer, vehicle, title }: {
  booking: CreateBookingResponse['booking']; bankTransfer: boolean; vehicle: { photos?: string[] | null; kind?: VehicleKind | null; make?: string | null; model?: string | null }; title: string;
}) {
  const t = useTheme();
  const reference = booking.reference;
  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{ title: 'Reserved' }} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.gallery, { borderColor: t.border }]}>
          <BikeImage vehicle={vehicle} style={StyleSheet.absoluteFill} />
          <View style={styles.reservedCaption}>
            <ThemedText type="eyebrow" style={{ color: t.accent }}>Your ride</ThemedText>
            <ThemedText type="heading">{title}</ThemedText>
          </View>
        </View>
        <Animated.View entering={ZoomIn.delay(250).springify()} style={[styles.check, { backgroundColor: t.success, borderColor: t.background }]}>
          <ThemedText style={{ color: '#fff', fontSize: 30, lineHeight: 34, fontWeight: 800 }}>✓</ThemedText>
        </Animated.View>
        <Animated.View style={{ alignItems: 'center', gap: Spacing.one }}>
          <ThemedText type="subtitle" style={{ textAlign: 'center' }}>Reserved!</ThemedText>
          <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>{bankTransfer ? 'Pay by bank transfer and upload the slip to confirm.' : 'Complete payment within 15 minutes to confirm.'}</ThemedText>
        </Animated.View>
        <Animated.View>
          <Card style={{ alignItems: 'center' }}>
            <ThemedText type="eyebrow" themeColor="textSecondary">Booking reference</ThemedText>
            <ThemedText type="subtitle" selectable style={{ letterSpacing: 2 }}>{reference}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              Use it as the transfer remark and show it at the counter.
            </ThemedText>
          </Card>
        </Animated.View>
        {bankTransfer && <TransferPayment booking={booking} />}
        <Animated.View>
          <Button variant={bankTransfer ? 'secondary' : 'primary'} title="View my rentals" onPress={() => router.replace('/bookings')} />
        </Animated.View>
        <CancelBooking id={booking.id} reference={reference} onCancelled={() => router.replace('/bookings')} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.three, gap: Spacing.four, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', paddingBottom: Spacing.six },
  gallery: { height: 300, borderRadius: Radius.lg + 4, overflow: 'hidden', borderWidth: 1 },
  dots: { position: 'absolute', bottom: Spacing.three, alignSelf: 'center', flexDirection: 'row', gap: 6 },
  dot: { height: 7, borderRadius: 4, backgroundColor: '#FFFFFF' },
  stockNote: { position: 'absolute', bottom: Spacing.three, right: Spacing.three, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(11,16,32,0.45)' },
  reservedCaption: { position: 'absolute', left: Spacing.three, top: Spacing.three },
  showroomTop: { position: 'absolute', top: Spacing.three, left: Spacing.three, flexDirection: 'row', gap: Spacing.two },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderWidth: 1.5, borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, minHeight: 44, justifyContent: 'center' },
  trip: { gap: 0 },
  tripRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 48 },
  lengthRow: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: Spacing.two, marginLeft: 22 },
  lengthChip: { borderWidth: 1.5, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 6 },
  tripPoint: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  tripDot: { width: 10, height: 10, borderRadius: 5 },
  tripLine: { marginLeft: 7, height: 22, borderLeftWidth: 2, borderStyle: 'dashed' },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  totalLine: { borderTopWidth: 1, paddingTop: Spacing.two, marginTop: Spacing.one },
  check: { width: 68, height: 68, borderRadius: 34, borderWidth: 4, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: -Spacing.six - Spacing.two },
});

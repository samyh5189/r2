import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, ErrorText } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, callFunction, type CreateBookingResponse, type QuoteResponse } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { useSession } from '@/lib/session';

const TERMS_VERSION = '2026-11-v1';
const DURATIONS = [
  { label: '2 hours', hours: 2 },
  { label: '4 hours', hours: 4 },
  { label: '1 day', hours: 24 },
  { label: '3 days', hours: 72 },
  { label: '1 week', hours: 168 },
];
const START_OPTIONS = [
  { label: 'In 1 hour', offsetHours: 1 },
  { label: 'Tomorrow 9:00', offsetHours: null },
];

function nextStart(offsetHours: number | null): Date {
  const d = new Date();
  if (offsetHours === null) {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  } else {
    d.setTime(d.getTime() + offsetHours * 3_600_000);
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0); // round to quarter hour
  }
  return d;
}

export default function BikeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const t = useTheme();

  const [startIdx, setStartIdx] = useState(0);
  const [hours, setHours] = useState(24);
  const [helmets, setHelmets] = useState(0);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState<'quote' | 'book' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateBookingResponse | null>(null);

  const start = useMemo(() => nextStart(START_OPTIONS[startIdx]!.offsetHours), [startIdx]);
  const end = useMemo(() => new Date(start.getTime() + hours * 3_600_000), [start, hours]);

  // Any change invalidates the current quote — the price shown is always the server's price for THIS selection.
  useEffect(() => { setQuote(null); setAccepted(false); }, [start, hours, helmets]);

  async function getQuote() {
    if (!session) return router.push('/sign-in');
    setBusy('quote'); setError(null);
    try {
      setQuote(await callFunction<QuoteResponse>('quote', {
        vehicleId: id, start: start.toISOString(), end: end.toISOString(),
        extras: helmets ? [{ code: 'helmet', quantity: helmets }] : [],
      }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not get a price.');
    } finally { setBusy(null); }
  }

  async function book() {
    if (!quote) return;
    setBusy('book'); setError(null);
    try {
      const res = await callFunction<CreateBookingResponse>('create-booking', { quoteId: quote.quoteId, acceptedTermsVersion: TERMS_VERSION });
      setResult(res);
      // TODO: present Stripe PaymentSheet with res.payment.clientSecret (@stripe/stripe-react-native).
      // The booking is confirmed by the server webhook, not by this screen.
    } catch (e) {
      if (e instanceof ApiError && e.code === 'KYC_REQUIRED') { setError(e.message); return router.push('/account'); }
      if (e instanceof ApiError && (e.code === 'QUOTE_EXPIRED' || e.code === 'JUST_TAKEN')) setQuote(null);
      setError(e instanceof ApiError ? e.message : 'Booking failed. You have not been charged.');
    } finally { setBusy(null); }
  }

  if (result) {
    return (
      <ThemedView style={styles.flex}>
        <View style={styles.body}>
          <ThemedText type="subtitle">Bike reserved</ThemedText>
          <Card>
            <ThemedText>Booking reference</ThemedText>
            <ThemedText type="subtitle" selectable>{result.booking.reference}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Complete payment within 15 minutes to confirm. You will get a confirmation by SMS and email.
            </ThemedText>
          </Card>
          <Button title="View my rentals" onPress={() => router.replace('/bookings')} />
        </View>
      </ThemedView>
    );
  }

  const chip = (label: string, selected: boolean, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}
      style={[styles.chip, { borderColor: selected ? t.accent : t.border, backgroundColor: selected ? t.backgroundSelected : 'transparent' }]}>
      <ThemedText type="small">{label}</ThemedText>
    </Pressable>
  );

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.body}>
        <ThemedText type="smallBold">Start</ThemedText>
        <View style={styles.chips}>{START_OPTIONS.map((o, i) => chip(o.label, i === startIdx, () => setStartIdx(i)))}</View>

        <ThemedText type="smallBold">Duration</ThemedText>
        <View style={styles.chips}>{DURATIONS.map((d) => chip(d.label, d.hours === hours, () => setHours(d.hours)))}</View>

        <ThemedText type="smallBold">Extra helmets</ThemedText>
        <View style={styles.chips}>{[0, 1, 2].map((n) => chip(String(n), n === helmets, () => setHelmets(n)))}</View>

        <Card>
          <ThemedText type="small" themeColor="textSecondary">Pickup</ThemedText>
          <ThemedText>{dateTime(start)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Return by</ThemedText>
          <ThemedText>{dateTime(end)}</ThemedText>
        </Card>

        {quote && (
          <Card>
            {quote.lines.map((l) => (
              <View key={l.code} style={styles.line}>
                <ThemedText type="small">{l.label}</ThemedText>
                <ThemedText type="small">{money(l.amount, quote.currency)}</ThemedText>
              </View>
            ))}
            <View style={styles.line}>
              <ThemedText type="smallBold">Total</ThemedText>
              <ThemedText type="smallBold">{money(quote.total, quote.currency)}</ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Refundable deposit of {money(quote.deposit, quote.currency)} is held on your card at pickup, not charged.
              Free cancellation until 24 h before pickup, 50% refund after.
            </ThemedText>
            <View style={styles.line}>
              <ThemedText type="small" style={styles.flex}>I accept the rental agreement and cancellation policy</ThemedText>
              <Switch value={accepted} onValueChange={setAccepted} accessibilityLabel="Accept rental agreement" />
            </View>
          </Card>
        )}

        <ErrorText>{error}</ErrorText>

        {quote ? (
          <Button title={`Book · ${money(quote.total, quote.currency)}`} onPress={book} disabled={!accepted} loading={busy === 'book'} />
        ) : (
          <Button title={session ? 'See price' : 'Sign in to see price'} onPress={getQuote} loading={busy === 'quote'} />
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.three, gap: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, minHeight: 44, justifyContent: 'center' },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
});

import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Switch, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition, ZoomIn } from 'react-native-reanimated';

import { KenBurns, Scrim, vehiclePhotos, type VehicleKind } from '@/components/photo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, ErrorText, Pill, PressableScale } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, callFunction, type CreateBookingResponse, type QuoteResponse } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

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

type BikeInfo = {
  kind: VehicleKind; photos: string[];
  make: string; model: string; engine_cc: number | null; year: number | null;
  branches: { name: string } | null;
  price_plans: { hourly: number; daily: number; deposit: number; currency: 'MVR' | 'USD' } | null;
};

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

  const [bike, setBike] = useState<BikeInfo | null>(null);
  const [startIdx, setStartIdx] = useState(0);
  const [hours, setHours] = useState(24);
  const [helmets, setHelmets] = useState(0);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState<'quote' | 'book' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateBookingResponse | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.from('vehicles')
      .select('kind, photos, make, model, engine_cc, year, branches(name), price_plans(hourly, daily, deposit, currency)')
      .eq('id', id).single()
      .then(({ data }) => setBike(data as unknown as BikeInfo | null));
  }, [id]);

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

  const title = bike ? `${bike.make} ${bike.model}` : 'Book a bike';

  const photos = bike ? vehiclePhotos(bike) : [];

  if (result) return <Reserved reference={result.booking.reference} photo={photos[0]} title={title} />;

  const plan = bike?.price_plans;

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.body}>
        <Animated.View entering={FadeIn.duration(400)}>
          <Gallery photos={photos} stock={!bike?.photos?.length} />
          <View style={styles.showroomTop}>
            <Pill label="Available" tone="success" />
            {bike?.engine_cc != null && <Pill label={`${bike.engine_cc} cc`} />}
            {bike?.year != null && <Pill label={String(bike.year)} />}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(450)} style={styles.titleRow}>
          <View style={styles.flex}>
            <ThemedText type="subtitle">{title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Pick up at {bike?.branches?.name ?? 'Main branch'}</ThemedText>
          </View>
          {plan && (
            <View style={{ alignItems: 'flex-end' }}>
              <ThemedText type="heading" style={{ color: t.accent }}>{money(plan.hourly, plan.currency)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">per hour</ThemedText>
            </View>
          )}
        </Animated.View>

        <Section label="When do you start?" delay={140}>
          {START_OPTIONS.map((o, i) => <Chip key={o.label} label={o.label} selected={i === startIdx} onPress={() => setStartIdx(i)} />)}
        </Section>
        <Section label="How long?" delay={200}>
          {DURATIONS.map((d) => <Chip key={d.label} label={d.label} selected={d.hours === hours} onPress={() => setHours(d.hours)} />)}
        </Section>
        <Section label="Extra helmets" delay={260}>
          {[0, 1, 2].map((n) => <Chip key={n} label={n === 0 ? 'None' : `+${n}`} selected={n === helmets} onPress={() => setHelmets(n)} />)}
        </Section>

        <Animated.View entering={FadeInDown.delay(320).duration(450)} layout={LinearTransition}>
          <Card style={styles.trip}>
            <TripPoint label="Pickup" value={dateTime(start)} color={t.success} />
            <View style={[styles.tripLine, { borderColor: t.border }]} />
            <TripPoint label="Return by" value={dateTime(end)} color={t.accent} />
          </Card>
        </Animated.View>

        {quote && (
          <Animated.View entering={FadeInDown.springify()} layout={LinearTransition}>
            <Card>
              {quote.lines.map((l, i) => (
                <Animated.View key={l.code} entering={FadeIn.delay(100 + i * 80)} style={styles.line}>
                  <ThemedText type="small">{l.label}</ThemedText>
                  <ThemedText type="small">{money(l.amount, quote.currency)}</ThemedText>
                </Animated.View>
              ))}
              <View style={[styles.line, styles.totalLine, { borderColor: t.border }]}>
                <ThemedText type="heading">Total</ThemedText>
                <Animated.View entering={ZoomIn.delay(250).springify()}>
                  <ThemedText type="heading" style={{ color: t.accent }}>{money(quote.total, quote.currency)}</ThemedText>
                </Animated.View>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Refundable deposit of {money(quote.deposit, quote.currency)} is held on your card at pickup, not charged.
                Free cancellation until 24 h before pickup, 50% refund after.
              </ThemedText>
              <View style={styles.line}>
                <ThemedText type="small" style={styles.flex}>I accept the rental agreement and cancellation policy</ThemedText>
                <Switch value={accepted} onValueChange={setAccepted} accessibilityLabel="Accept rental agreement"
                  trackColor={{ true: t.accent, false: t.border }} thumbColor="#FFFFFF" />
              </View>
            </Card>
          </Animated.View>
        )}

        <ErrorText>{error}</ErrorText>

        <Animated.View layout={LinearTransition}>
          {quote ? (
            <Button title={`Book · ${money(quote.total, quote.currency)}`} onPress={book} disabled={!accepted} loading={busy === 'book'} />
          ) : (
            <Button title={session ? 'See my price' : 'Sign in to see price'} onPress={getQuote} loading={busy === 'quote'} />
          )}
        </Animated.View>
      </ScrollView>
    </ThemedView>
  );
}

function Section({ label, delay, children }: { label: string; delay: number; children: React.ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(450)} style={{ gap: Spacing.two }}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View style={styles.chips}>{children}</View>
    </Animated.View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
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

function TripPoint({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.tripPoint}>
      <View style={[styles.tripDot, { borderColor: color }]} />
      <View>
        <ThemedText type="eyebrow" themeColor="textSecondary">{label}</ThemedText>
        <ThemedText type="smallBold" style={{ fontSize: 16 }}>{value}</ThemedText>
      </View>
    </View>
  );
}

/** Swipeable photo gallery with page dots. */
function Gallery({ photos, stock }: { photos: ReturnType<typeof vehiclePhotos>; stock: boolean }) {
  const t = useTheme();
  const { width: screenW } = useWindowDimensions();
  const [w, setW] = useState(Math.min(screenW - Spacing.three * 2, MaxContentWidth));
  const [page, setPage] = useState(0);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, w)));
  if (!photos.length) return <View style={[styles.gallery, { backgroundColor: t.backgroundSelected }]} />;
  return (
    <View style={[styles.gallery, { borderColor: t.border }]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {photos.length === 1 ? (
        <KenBurns source={photos[0]} height={300} scrim={false} />
      ) : (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={32}>
          {photos.map((p, i) => (
            <Image key={i} source={p} style={{ width: w, height: 300 }} contentFit="cover" transition={300} />
          ))}
        </ScrollView>
      )}
      <Scrim top={0.35} to={0.35} />
      {photos.length > 1 && (
        <View style={styles.dots} pointerEvents="none">
          {photos.map((_, i) => (
            <View key={i} style={[styles.dot, { width: i === page ? 18 : 7, opacity: i === page ? 1 : 0.6 }]} />
          ))}
        </View>
      )}
      {stock && (
        <View style={styles.stockNote}>
          <ThemedText type="small" style={{ color: '#fff', fontSize: 12, lineHeight: 16 }}>Representative photo</ThemedText>
        </View>
      )}
    </View>
  );
}

/** Success: the vehicle photo with a confirmation check popping in. */
function Reserved({ reference, photo, title }: { reference: string; photo?: ReturnType<typeof vehiclePhotos>[number]; title: string }) {
  const t = useTheme();
  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{ title: 'Reserved' }} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.gallery, { borderColor: t.border }]}>
          {photo && <KenBurns source={photo} height={240} />}
          <View style={styles.reservedCaption}>
            <ThemedText type="eyebrow" style={{ color: 'rgba(255,255,255,0.85)' }}>Your ride</ThemedText>
            <ThemedText type="heading" style={{ color: '#fff' }}>{title}</ThemedText>
          </View>
        </View>
        <Animated.View entering={ZoomIn.delay(250).springify()} style={[styles.check, { backgroundColor: t.success, borderColor: t.background }]}>
          <ThemedText style={{ color: '#fff', fontSize: 30, lineHeight: 34, fontWeight: 800 }}>✓</ThemedText>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(400)} style={{ alignItems: 'center', gap: Spacing.one }}>
          <ThemedText type="subtitle" style={{ textAlign: 'center' }}>Reserved!</ThemedText>
          <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>Complete payment within 15 minutes to confirm.</ThemedText>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(550)}>
          <Card style={{ alignItems: 'center' }}>
            <ThemedText type="eyebrow" themeColor="textSecondary">Booking reference</ThemedText>
            <ThemedText type="subtitle" selectable style={{ letterSpacing: 2 }}>{reference}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              Show this at the counter. You will get a confirmation by SMS and email.
            </ThemedText>
          </Card>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(700)}>
          <Button title="View my rentals" onPress={() => router.replace('/bookings')} />
        </Animated.View>
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
  reservedCaption: { position: 'absolute', left: Spacing.three, bottom: Spacing.three },
  showroomTop: { position: 'absolute', top: Spacing.three, left: Spacing.three, flexDirection: 'row', gap: Spacing.two },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderWidth: 1.5, borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, minHeight: 44, justifyContent: 'center' },
  trip: { gap: 0 },
  tripPoint: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  tripDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 4 },
  tripLine: { marginLeft: 7, height: 22, borderLeftWidth: 2, borderStyle: 'dashed' },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  totalLine: { borderTopWidth: 1, paddingTop: Spacing.two, marginTop: Spacing.one },
  check: { width: 68, height: 68, borderRadius: 34, borderWidth: 4, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: -Spacing.six - Spacing.two },
});

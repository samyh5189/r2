import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import { baseRental, billableHours } from '@motor-rent/shared';

import { DURATIONS, MAX_RENTAL_DAYS, MIN_RENTAL_HOURS, Reserved, lengthLabel } from '@/components/booking-parts';
import { DateTimePicker, firstSlot } from '@/components/date-time-picker';
import { Plate } from '@/components/plate';
import { vehiclePhotos, type VehicleKind } from '@/components/photo';
import { BrandMark } from '@/components/brand';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, ErrorText, Pill, PressableScale } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, callFunction, type CreateBookingResponse, type QuoteResponse } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { TERMS_VERSION } from '@/lib/terms';

type Bike = {
  id: string; kind: VehicleKind; photos: string[]; plate: string; make: string; model: string; engine_cc: number | null;
  branches: { name: string } | null;
  price_plans: { hourly: number; daily: number; weekly: number; deposit: number; multiplier: number; currency: 'MVR' | 'USD' } | null;
};
const STEPS = ['Pickup', 'Return', 'Bike', 'Extras', 'Review'] as const;
const LAST = STEPS.length - 1;

/**
 * Focused booking flow, one question per screen: pickup, return, bike (only those free), extras + server price, review and book.
 * A "Your ride" ticket fills in as the rider answers (beside the question on wide screens, below it on phones).
 * All choices live in the URL (?start&end&bike&helmets&step) so Back, refresh and the sign-in round trip keep them.
 */
export default function BookScreen() {
  const params = useLocalSearchParams<{ start?: string; end?: string; bike?: string; helmets?: string; step?: string }>();
  const { session } = useSession();
  const t = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const [earliest] = useState(() => firstSlot(new Date(Date.now() + 60 * 60_000)));
  const start = params.start && +new Date(params.start) >= +earliest ? new Date(params.start) : earliest;
  const endParam = params.end ? new Date(params.end) : null;
  const end = endParam && +endParam > +start ? endParam : new Date(+start + 24 * 3_600_000);
  const hours = Math.round((+end - +start) / 3_600_000);
  const step = Math.min(LAST, Math.max(0, Number(params.step ?? 0) || 0));
  const bikeId = params.bike ?? null;
  const helmets = Math.min(2, Math.max(0, Number(params.helmets ?? 0) || 0));

  const set = (p: Record<string, string | undefined>) => router.setParams(p);
  const go = (s: number) => set({ step: String(s) });
  const minEnd = useMemo(() => new Date(+start + MIN_RENTAL_HOURS * 3_600_000), [start]);
  function setStart(d: Date) {
    const len = Math.max(+end - +start, MIN_RENTAL_HOURS * 3_600_000);
    set({ start: d.toISOString(), end: firstSlot(new Date(+d + len)).toISOString() });
  }

  // Fleet and availability for the chosen times.
  const [bikes, setBikes] = useState<Bike[] | null>(null);
  const [free, setFree] = useState<Set<string> | null>(null);
  useEffect(() => {
    supabase.from('vehicles')
      .select('id, kind, photos, plate, make, model, engine_cc, branches(name), price_plans(hourly, daily, weekly, deposit, multiplier, currency)')
      .eq('status', 'active').order('make')
      .then(({ data }) => setBikes((data ?? []) as unknown as Bike[]));
  }, []);
  const startIso = start.toISOString(), endIso = end.toISOString();
  useEffect(() => {
    setFree(null);
    supabase.rpc('available_vehicles', { p_start: startIso, p_end: endIso })
      .then(({ data }) => setFree(new Set(((data ?? []) as (string | { available_vehicles: string })[]).map((x) => (typeof x === 'string' ? x : x.available_vehicles)))));
  }, [startIso, endIso]);
  // Busy windows for the next 120 days, to work out when booked bikes are free again.
  const [busy, setBusy] = useState<Busy[] | null>(null);
  useEffect(() => {
    supabase.rpc('vehicle_busy', { p_from: new Date().toISOString(), p_to: new Date(Date.now() + 120 * 86_400_000).toISOString() })
      .then(({ data }) => setBusy(((data ?? []) as { vehicle_id: string; busy_from: string; busy_to: string }[])
        .map((r) => ({ id: r.vehicle_id, from: +new Date(r.busy_from), to: +new Date(r.busy_to) }))));
  }, []);
  const bike = bikes?.find((b) => b.id === bikeId) ?? null;
  const estimate = (b: Bike) => {
    const p = b.price_plans; if (!p) return null;
    return Math.round(baseRental(billableHours(start, end), p) * (Number(p.multiplier) || 1));
  };

  // Server price for the exact selection (needs sign-in).
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [result, setResult] = useState<CreateBookingResponse | null>(null);
  useEffect(() => { setQuote(null); setAccepted(false); }, [startIso, endIso, bikeId, helmets]);
  useEffect(() => {
    if (step < 3 || !bikeId || !session || quote) return;
    let live = true;
    setQuoting(true); setError(null);
    callFunction<QuoteResponse>('quote', { vehicleId: bikeId, start: startIso, end: endIso, extras: helmets ? [{ code: 'helmet', quantity: helmets }] : [] })
      .then((q) => live && setQuote(q))
      .catch((e) => live && setError(e instanceof ApiError ? e.message : 'Could not get a price.'))
      .finally(() => live && setQuoting(false));
    return () => { live = false; };
  }, [step, bikeId, session, quote, startIso, endIso, helmets]);

  // Identity check status, shown before the last step instead of failing at "Book".
  const [kyc, setKyc] = useState<'verified' | 'pending' | 'none' | null>(null);
  const [me, setMe] = useState<{ full_name: string | null; phone: string | null; whatsapp: string | null } | null>(null);
  useEffect(() => {
    if (!session) return setKyc(null);
    Promise.all([
      supabase.from('profiles').select('kyc_status, licence_expires_on, full_name, phone, whatsapp').eq('id', session.user.id).single(),
      supabase.from('kyc_submissions').select('status').eq('profile_id', session.user.id).eq('status', 'pending').limit(1),
    ]).then(([p, s]) => {
      setMe(p.data ? { full_name: p.data.full_name, phone: p.data.phone, whatsapp: p.data.whatsapp } : null);
      const ok = p.data?.kyc_status === 'approved' && p.data.licence_expires_on && new Date(p.data.licence_expires_on) > new Date();
      setKyc(ok ? 'verified' : s.data?.length ? 'pending' : 'none');
    });
  }, [session]);

  const here = `/book?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}${bikeId ? `&bike=${bikeId}` : ''}&helmets=${helmets}&step=${step}`;

  async function book() {
    if (!quote) return;
    setBooking(true); setError(null);
    try {
      setResult(await callFunction<CreateBookingResponse>('create-booking', { quoteId: quote.quoteId, acceptedTermsVersion: TERMS_VERSION }));
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'KYC_REQUIRED' || e.code === 'LICENCE_EXPIRES')) {
        setError(e.message);
        return router.push({ pathname: '/verify', params: { next: here } });
      }
      if (e instanceof ApiError && (e.code === 'QUOTE_EXPIRED' || e.code === 'JUST_TAKEN')) setQuote(null);
      setError(e instanceof ApiError ? e.message : 'Booking failed. You have not been charged.');
    } finally { setBooking(false); }
  }

  if (result && bike) {
    return <Reserved booking={result.booking} bankTransfer={result.payment.provider === 'bank_transfer'} photo={vehiclePhotos(bike)[0]} title={`${bike.make} ${bike.model}`} />;
  }

  const price = quote ? money(quote.total, quote.currency)
    : bike && estimate(bike) != null ? money(estimate(bike)!, bike.price_plans!.currency) : null;
  const firstName = me?.full_name?.trim().split(/\s+/)[0];
  const freeCount = free?.size ?? 0;

  /** One screen = one question: a short lead line, a big question, the answer, one button. */
  const screen = (lead: string, question: string, body: React.ReactNode) => (
    <Animated.View key={step} entering={FadeInRight.duration(240)} style={styles.stepBody}>
      {step > 0 && (
        <Pressable onPress={() => go(step - 1)} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'flex-start' }}>
          <ThemedText type="smallBold" themeColor="accent">‹ Back</ThemedText>
        </Pressable>
      )}
      <ThemedText themeColor="textSecondary" style={{ fontSize: 17 }}>{lead}</ThemedText>
      <ThemedText type="title" accessibilityRole="header" style={[styles.question, { fontSize: wide ? 52 : 36, lineHeight: wide ? 54 : 39 }]}>{question}</ThemedText>
      {body}
    </Animated.View>
  );

  const ticket = (
    <View style={[styles.ticket, { borderColor: t.border, backgroundColor: t.backgroundElement }]}>
      <View style={styles.ticketPad}>
        <View style={styles.rowBetween}>
          <ThemedText type="eyebrow" style={{ color: t.accent }}>Your ride</ThemedText>
          {bike ? <Plate size="sm">{bike.plate}</Plate> : <ThemedText type="small" themeColor="textSecondary">Bike</ThemedText>}
        </View>
        <ThemedText type="heading" themeColor={bike ? 'text' : 'textSecondary'}>{bike ? `${bike.make} ${bike.model}` : 'Not chosen yet'}</ThemedText>
      </View>
      <View style={[styles.ticketPad, styles.dashed, { borderColor: t.border }]}>
        <View style={styles.rowBetween}>
          <View><ThemedText type="small" themeColor="textSecondary">Pickup</ThemedText><ThemedText type="smallBold">{dateTime(start)}</ThemedText></View>
          <View style={styles.connector}>
            <View style={[styles.dot, { backgroundColor: t.accent }]} />
            <View style={[styles.connLine, { backgroundColor: t.accent }]} />
            <View style={[styles.dot, { backgroundColor: step >= 1 ? t.accent : t.border }]} />
          </View>
          <View style={{ alignItems: 'flex-end' }}><ThemedText type="small" themeColor="textSecondary">Return</ThemedText><ThemedText type="smallBold">{step >= 1 ? dateTime(end) : '—'}</ThemedText></View>
        </View>
        <ThemedText type="small" themeColor="textSecondary">{step >= 1 ? lengthLabel(hours) : 'Return time next'}{helmets ? `, ${helmets} extra helmet${helmets > 1 ? 's' : ''}` : ''}</ThemedText>
      </View>
      <View style={[styles.ticketPad, styles.dashed, styles.rowBetween, { borderColor: t.border }]}>
        <View style={styles.flex}><ThemedText type="small" themeColor="textSecondary">Rider</ThemedText><ThemedText type="smallBold">{me?.full_name || (session ? '—' : 'Sign in at the extras step')}</ThemedText></View>
        <View style={[styles.flex, { alignItems: 'flex-end' }]}><ThemedText type="small" themeColor="textSecondary">Mobile</ThemedText><ThemedText type="smallBold">{me?.whatsapp || me?.phone || '—'}</ThemedText></View>
      </View>
      <View style={[styles.ticketPad, { backgroundColor: t.backgroundSelected }]}>
        <ThemedText type="small" themeColor="textSecondary">{quote ? 'Total' : 'Estimated total'}</ThemedText>
        <View style={styles.rowBetween}>
          <ThemedText type="subtitle" style={{ color: price ? t.text : t.textSecondary }}>{price ?? '—'}</ThemedText>
          {quote && quote.deposit > 0 && <ThemedText type="small" themeColor="textSecondary">+ {money(quote.deposit, quote.currency)} refundable deposit</ThemedText>}
        </View>
      </View>
    </View>
  );

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{ headerShown: false, title: 'Book a ride' }} />
      <View style={[styles.bar, { borderColor: t.border, backgroundColor: t.background }]}>
        <Pressable onPress={() => router.replace('/')} accessibilityRole="link" accessibilityLabel="Rent a Motor home" style={styles.brand}>
          <BrandMark size={30} />
          <ThemedText type="smallBold" style={{ fontSize: 17 }}>Rent a Motor</ThemedText>
        </Pressable>
        <ThemedText type="small" themeColor="textSecondary" style={{ marginLeft: 'auto' }}>{step + 1} of {STEPS.length}</ThemedText>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" accessibilityLabel="Close booking" hitSlop={10} style={styles.close}>
          <ThemedText style={{ fontSize: 24, lineHeight: 26 }}>×</ThemedText>
        </Pressable>
      </View>
      <View style={[styles.progress, { backgroundColor: t.border }]} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: STEPS.length, now: step + 1 }}>
        <View style={{ width: `${((step + 1) / STEPS.length) * 100}%`, height: '100%', backgroundColor: t.accent }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, wide && styles.scrollWide]} keyboardShouldPersistTaps="handled">
        <View style={[styles.main, wide && { flex: 1 }]}>
          {step === 0 && screen(
            firstName ? `Hi ${firstName}, let’s get you on a bike. It takes about a minute.` : 'Let’s get you on a bike. It takes about a minute.',
            'When do you want to pick up?',
            <>
              <DateTimePicker value={start} onChange={setStart} min={earliest} days={MAX_RENTAL_DAYS} />
              <ThemedText type="small" themeColor="textSecondary">Our counter is open 07:00 to 22:00.</ThemedText>
              <Button title="Continue" onPress={() => go(1)} />
            </>,
          )}

          {step === 1 && screen(
            `Pickup ${dateTime(start)}.`,
            'When will you bring it back?',
            <>
              <View style={styles.chips}>
                {DURATIONS.map((d) => (
                  <Choice key={d.label} label={d.label} selected={d.hours === hours} onPress={() => set({ end: new Date(+start + d.hours * 3_600_000).toISOString() })} />
                ))}
              </View>
              <DateTimePicker value={end} onChange={(d) => set({ end: d.toISOString() })} min={minEnd} days={MAX_RENTAL_DAYS + 1} />
              <Button title={free == null ? 'See available bikes' : freeCount ? `See ${freeCount} available bike${freeCount === 1 ? '' : 's'}` : 'See bikes'}
                onPress={() => go(2)} disabled={hours > MAX_RENTAL_DAYS * 24} />
            </>,
          )}

          {step === 2 && screen(
            `${dateTime(start)} to ${dateTime(end)}.`,
            'Which bike would you like?',
            !bikes || !free ? <ActivityIndicator color={t.accent} /> : (
              <BikeList bikes={bikes} free={free} selected={bikeId} estimate={estimate}
                nextFree={(b) => (busy ? nextFree(busy.filter((w) => w.id === b.id), start, +end - +start) : null)}
                onPick={(id) => set({ bike: id, step: '3' })}
                onPickAt={(id, s) => set({ bike: id, start: s.toISOString(), end: new Date(+s + (+end - +start)).toISOString(), step: '3' })}
                onChangeTimes={() => go(0)} />
            ),
          )}

          {step === 3 && bike && screen(
            `${bike.make} ${bike.model}, good choice.`,
            'Need a helmet for a passenger?',
            <>
              <ThemedText themeColor="textSecondary">One helmet comes with the bike.</ThemedText>
              <View style={styles.chips}>
                {[0, 1, 2].map((n) => <Choice key={n} label={n === 0 ? 'No, just me' : n === 1 ? 'Yes, one more' : 'Two more'} selected={n === helmets} onPress={() => set({ helmets: String(n) })} />)}
              </View>
              {!session ? (
                <View style={{ gap: Spacing.two }}>
                  <ThemedText>Sign in to see your exact price and book. Your choices are kept.</ThemedText>
                  <Button title="Sign in to continue" onPress={() => router.push({ pathname: '/sign-in', params: { next: here } })} />
                </View>
              ) : (
                <Button title={quoting ? 'Getting your price…' : 'Continue'} onPress={() => go(4)} disabled={!quote} loading={quoting} />
              )}
              <ErrorText>{error}</ErrorText>
            </>,
          )}

          {step === 4 && bike && screen(
            'Last step.',
            'Check and book.',
            <>
              {!quote ? (quoting ? <ActivityIndicator color={t.accent} /> : <ErrorText>{error ?? 'Go back a step to get your price.'}</ErrorText>) : (
                <Card>
                  {quote.lines.map((l) => (
                    <View key={l.code} style={styles.line}>
                      <ThemedText type="small">{l.label}</ThemedText>
                      <ThemedText type="small">{money(l.amount, quote.currency)}</ThemedText>
                    </View>
                  ))}
                  <View style={[styles.line, styles.totalLine, { borderColor: t.border }]}>
                    <ThemedText type="heading">Total</ThemedText>
                    <ThemedText type="heading" style={{ color: t.accent }}>{money(quote.total, quote.currency)}</ThemedText>
                  </View>
                  {quote.deposit > 0 && <ThemedText type="small" themeColor="textSecondary">Refundable deposit of {money(quote.deposit, quote.currency)} at pickup.</ThemedText>}
                  <View style={styles.line}>
                    <ThemedText type="small" style={styles.flex}>I accept the{' '}
                      <ThemedText type="small" themeColor="accent" onPress={() => router.push('/terms')} accessibilityRole="link" style={{ textDecorationLine: 'underline' }}>rental terms</ThemedText>
                      , including cancellations and the blocklist</ThemedText>
                    <Switch value={accepted} onValueChange={setAccepted} accessibilityLabel="Accept rental terms" trackColor={{ true: t.accent, false: t.border }} thumbColor="#FFFFFF" />
                  </View>
                </Card>
              )}
              {kyc && kyc !== 'verified' && (
                <Card style={{ borderColor: t.warning, gap: Spacing.two }}>
                  <Pill label={kyc === 'pending' ? 'Verification under review' : 'Verification needed'} tone="warning" />
                  <ThemedText type="small">{kyc === 'pending'
                    ? 'We’re checking your documents. You can book as soon as you’re verified (usually within an hour).'
                    : 'Before your first rental, upload your driving licence, ID and a selfie. It takes about 2 minutes, and your choices are kept.'}</ThemedText>
                  {kyc === 'none' && <Button variant="secondary" title="Verify my identity" onPress={() => router.push({ pathname: '/verify', params: { next: here } })} />}
                </Card>
              )}
              <ErrorText>{quote ? error : null}</ErrorText>
              {quote && <Button title={`Book for ${money(quote.total, quote.currency)}`} onPress={book} disabled={!accepted || kyc === 'pending'} loading={booking} />}
            </>,
          )}

          {step >= 3 && !bike && bikes && (
            <Card style={{ gap: Spacing.two }}>
              <ThemedText>Choose a bike first.</ThemedText>
              <Button variant="secondary" title="Pick a bike" onPress={() => go(2)} />
            </Card>
          )}

          {!wide && <View style={{ marginTop: Spacing.three }}>{ticket}</View>}
        </View>
        {wide && <View style={styles.side}>{ticket}</View>}
      </ScrollView>
    </ThemedView>
  );
}

/** Large tap target for a single choice. */
function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} scaleTo={0.96} lift={false}
      style={[styles.choice, { borderColor: selected ? t.accent : t.border, backgroundColor: selected ? t.accent : t.backgroundElement }]}>
      <ThemedText type="smallBold" style={{ color: selected ? t.accentText : t.text, fontSize: 16 }}>{label}</ThemedText>
    </PressableScale>
  );
}

type Busy = { id: string; from: number; to: number };
const MV = 5 * 3_600_000;
const mvHour = (ms: number) => new Date(ms + MV).getUTCHours() + new Date(ms + MV).getUTCMinutes() / 60;

/** Earliest counter-hours pickup (at or after `from`) where a rental of `len` ms fits between busy windows. */
function nextFree(windows: Busy[], from: Date, len: number): Date | null {
  let s = firstSlot(from);
  for (let i = 0; i < 400; i++) {
    const e = +s + len;
    const clash = windows.find((w) => w.from < e && w.to > +s);
    if (clash) { s = firstSlot(new Date(clash.to)); continue; }
    const h = mvHour(e);
    if (h < 7 || h > 22) { s = firstSlot(new Date(+s + 30 * 60_000)); continue; }
    return s;
  }
  return null;
}

function BikeList({ bikes, free, selected, estimate, nextFree: freeAt, onPick, onPickAt, onChangeTimes }: {
  bikes: Bike[]; free: Set<string>; selected: string | null; estimate: (b: Bike) => number | null;
  nextFree: (b: Bike) => Date | null;
  onPick: (id: string) => void; onPickAt: (id: string, start: Date) => void; onChangeTimes: () => void;
}) {
  const t = useTheme();
  const available = bikes.filter((b) => free.has(b.id));
  const taken = bikes.filter((b) => !free.has(b.id));
  const bookedList = !!taken.length && (
    <View style={{ gap: Spacing.two, marginTop: Spacing.two }}>
      <ThemedText type="smallBold" themeColor="textSecondary">Booked for your times</ThemedText>
      {taken.map((b) => {
        const at = freeAt(b);
        return (
          <View key={b.id} style={[styles.bike, { borderColor: t.border, backgroundColor: t.backgroundElement }]}>
            <Image source={vehiclePhotos(b)[0]} style={[styles.bikePhoto, { opacity: 0.55 }]} contentFit="cover" />
            <View style={[styles.flex, { gap: 4 }]}>
              <ThemedText type="smallBold" style={{ fontSize: 17 }}>{b.make} {b.model}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{at ? `Free for the same length from ${dateTime(at)}` : 'Checking when it’s free…'}</ThemedText>
              {at && (
                <ThemedText type="smallBold" themeColor="accent" onPress={() => onPickAt(b.id, at)} accessibilityRole="button"
                  style={{ textDecorationLine: 'underline' }}>Book it then</ThemedText>
              )}
            </View>
            <Plate size="sm">{b.plate}</Plate>
          </View>
        );
      })}
    </View>
  );
  if (!available.length) {
    return (
      <View style={{ gap: Spacing.two }}>
        <Card style={{ gap: Spacing.two }}>
          <ThemedText>{bikes.length === 1 ? 'Our bike is booked for these times.' : 'All bikes are booked for these times.'}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Pick different times, or book when a bike is free again below.</ThemedText>
          <Button variant="secondary" title="Change times" onPress={onChangeTimes} />
        </Card>
        {bookedList}
      </View>
    );
  }
  return (
    <View style={{ gap: Spacing.two }}>
      <ThemedText themeColor="textSecondary">{available.length} free for your times. Prices are for the whole rental.</ThemedText>
      {available.map((b, i) => {
        const est = estimate(b);
        const sel = b.id === selected;
        return (
          <Animated.View key={b.id} entering={FadeIn.delay(i * 40)}>
            <PressableScale onPress={() => onPick(b.id)} accessibilityRole="button" accessibilityLabel={`Choose ${b.make} ${b.model}, ${b.plate}`}
              style={[styles.bike, { borderColor: sel ? t.accent : t.border, backgroundColor: t.backgroundElement }]}>
              <Image source={vehiclePhotos(b)[0]} style={styles.bikePhoto} contentFit="cover" />
              <View style={[styles.flex, { gap: 4 }]}>
                <ThemedText type="smallBold" style={{ fontSize: 17 }}>{b.make} {b.model}</ThemedText>
                <View style={styles.rowBetween}>
                  <Plate size="sm">{b.plate}</Plate>
                  <ThemedText type="small" themeColor="textSecondary">{b.engine_cc ? `${b.engine_cc} cc, ` : ''}{b.branches?.name ?? ''}</ThemedText>
                </View>
              </View>
              {est != null && b.price_plans && (
                <View style={{ alignItems: 'flex-end' }}>
                  <ThemedText type="heading" style={{ color: t.accent }}>{money(est, b.price_plans.currency)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">about</ThemedText>
                </View>
              )}
            </PressableScale>
          </Animated.View>
        );
      })}
      {bookedList}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.two },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  progress: { height: 3, width: '100%' },
  scroll: { padding: Spacing.three, paddingTop: Spacing.five, paddingBottom: Spacing.six, gap: Spacing.five, width: '100%', maxWidth: 640, alignSelf: 'center' },
  scrollWide: { flexDirection: 'row', alignItems: 'flex-start', maxWidth: 1180, paddingHorizontal: Spacing.five },
  main: { gap: Spacing.three },
  side: { width: 400 },
  stepBody: { gap: Spacing.three, maxWidth: 620 },
  question: { letterSpacing: -1 },
  ticket: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  ticketPad: { padding: Spacing.three, gap: Spacing.two },
  dashed: { borderTopWidth: 1, borderStyle: 'dashed' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  connector: { flexDirection: 'row', alignItems: 'center', flex: 1, maxWidth: 70, marginHorizontal: Spacing.two },
  connLine: { flex: 1, height: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  choice: { borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: Spacing.three, paddingVertical: 12, minHeight: 48, justifyContent: 'center' },
  bike: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.two, borderRadius: Radius.md, borderWidth: 1.5 },
  bikePhoto: { width: 96, height: 72, borderRadius: Radius.sm },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  totalLine: { borderTopWidth: 1, paddingTop: Spacing.two, marginTop: Spacing.one },
});

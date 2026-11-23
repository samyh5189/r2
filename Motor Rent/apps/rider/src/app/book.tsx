import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import { baseRental, billableHours, LICENCE_CATEGORIES, licenceCategoryFor, licenceCovers, normPhone, phoneLabel } from '@motor-rent/shared';

import { DURATIONS, MAX_RENTAL_DAYS, MIN_RENTAL_HOURS, Reserved, lengthLabel, type GuestDetails } from '@/components/booking-parts';
import { DateTimePicker, firstSlot } from '@/components/date-time-picker';
import { Plate } from '@/components/plate';
import { BikeImage, showsCutout, type VehicleKind } from '@/components/photo';
import { BrandMark } from '@/components/brand';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, ErrorText, Field, Pill, PressableScale } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, callFunction, type CreateBookingResponse, type GuestBookingResponse, type QuoteResponse } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { TERMS_VERSION } from '@/lib/terms';

type Bike = {
  id: string; kind: VehicleKind; photos: string[]; plate: string; make: string; model: string; engine_cc: number | null; colour?: string | null;
  branches: { name: string } | null;
  price_plans: { hourly: number; daily: number; weekly: number; deposit: number; multiplier: number; currency: 'MVR' | 'USD' } | null;
};
const STEPS = ['Ride', 'Pickup', 'Return', 'Vehicle', 'Extras', 'Review'] as const;

/** What to call a set of vehicles: "bike(s)" or "car(s)" when they're all one kind, else "vehicle(s)". */
function noun(list: { kind: string }[] | null | undefined, n = 2) {
  const kinds = new Set((list ?? []).map((v) => (v.kind === 'car' ? 'car' : 'bike')));
  const word = kinds.size === 1 ? [...kinds][0]! : 'vehicle';
  return n === 1 ? word : `${word}s`;
}
const LAST = STEPS.length - 1;

/**
 * Focused booking flow, one question per screen: pickup, return, bike (only those free), extras + server price, review and book.
 * A "Your ride" ticket fills in as the rider answers (beside the question on wide screens, below it on phones).
 * All choices live in the URL (?start&end&bike&helmets&step) so Back, refresh and the sign-in round trip keep them.
 */
export default function BookScreen() {
  const params = useLocalSearchParams<{ start?: string; end?: string; bike?: string; helmets?: string; step?: string; type?: string }>();
  const { session } = useSession();
  const t = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const [earliest] = useState(() => firstSlot(new Date(Date.now() + 60 * 60_000)));
  const start = params.start && +new Date(params.start) >= +earliest ? new Date(params.start) : earliest;
  const endParam = params.end ? new Date(params.end) : null;
  const end = endParam && +endParam > +start ? endParam : new Date(+start + 24 * 3_600_000);
  const hours = Math.round((+end - +start) / 3_600_000);
  const bikeId = params.bike ?? null;
  const askedHelmets = Math.min(2, Math.max(0, Number(params.helmets ?? 0) || 0));

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
      .select('id, kind, photos, plate, make, model, engine_cc, colour, branches(name), price_plans(hourly, daily, weekly, deposit, multiplier, currency)')
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
  // Helmets are for two-wheelers; a car never carries one into the quote.
  const isCar = bike?.kind === 'car';
  const helmets = isCar ? 0 : askedHelmets;

  // Bike or car: asked first when the fleet has both (skipped when a vehicle was already picked).
  const kindOf = (v: { kind: string }) => (v.kind === 'car' ? 'car' : 'bike');
  const hasBoth = !!bikes && new Set(bikes.map(kindOf)).size > 1;
  const type: 'bike' | 'car' | null = params.type === 'car' || params.type === 'bike' ? params.type : bike ? kindOf(bike) : null;
  const firstStep = hasBoth && !(bike && !params.type) ? 0 : 1;
  const asked = Math.min(LAST, Math.max(firstStep, Number(params.step ?? 0) || 0));
  // Until the fleet loads we don't know if there's a choice to make: hold on the first screen.
  const step = (!bikes && !type && !params.bike) || (hasBoth && !type) ? 0 : asked;
  // Only the chosen kind is offered from here on.
  const shown = bikes && type ? bikes.filter((b) => kindOf(b) === type) : bikes;
  const pickType = (k: 'bike' | 'car') => set({ type: k, step: '1', ...(bike && kindOf(bike) !== k ? { bike: undefined } : {}) });
  // Helmets are an optional extra (none come with the bike); show the daily price on the extras step.
  const [helmetPrice, setHelmetPrice] = useState<number | null>(null);
  useEffect(() => {
    supabase.from('extras').select('per_day').eq('code', 'helmet').maybeSingle()
      .then(({ data }) => setHelmetPrice(data?.per_day ?? null));
  }, []);
  const estimate = (b: Bike) => {
    const p = b.price_plans; if (!p) return null;
    return Math.round(baseRental(billableHours(start, end), p) * (Number(p.multiplier) || 1));
  };

  // Server price for the exact selection (signed in or not).
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [result, setResult] = useState<CreateBookingResponse | null>(null);
  const [guestResult, setGuestResult] = useState<(GuestBookingResponse & { guest: GuestDetails }) | null>(null);
  // A visitor's price can't be used after signing in (and the other way round), so price again.
  const who = session?.user.id ?? null;
  useEffect(() => { setQuote(null); setAccepted(false); }, [startIso, endIso, bikeId, helmets, who]);
  // How the rider gets the vehicle, and who to call (asked on the last step).
  const [handover, setHandover] = useState<'counter' | 'delivery'>('counter');
  const [address, setAddress] = useState('');
  const [guestName, setGuestName] = useState('');
  const [phone, setPhone] = useState('');
  useEffect(() => {
    if (step < 4 || !bikeId || quote) return;
    let live = true;
    setQuoting(true); setError(null);
    callFunction<QuoteResponse>('quote', { vehicleId: bikeId, start: startIso, end: endIso, extras: helmets ? [{ code: 'helmet', quantity: helmets }] : [] })
      .then((q) => live && setQuote(q))
      .catch((e) => live && setError(e instanceof ApiError ? e.message : 'Could not get a price.'))
      .finally(() => live && setQuoting(false));
    return () => { live = false; };
  }, [step, bikeId, quote, startIso, endIso, helmets]);

  // Identity check status, shown before the last step instead of failing at "Book".
  const [kyc, setKyc] = useState<'verified' | 'pending' | 'none' | null>(null);
  const [me, setMe] = useState<{ full_name: string | null; phone: string | null; whatsapp: string | null } | null>(null);
  const [licence, setLicence] = useState<string[] | null>(null);
  useEffect(() => {
    if (!session) return setKyc(null);
    Promise.all([
      supabase.from('profiles').select('kyc_status, licence_expires_on, licence_categories, full_name, phone, whatsapp').eq('id', session.user.id).single(),
      supabase.from('kyc_submissions').select('status').eq('profile_id', session.user.id).eq('status', 'pending').limit(1),
    ]).then(([p, s]) => {
      setMe(p.data ? { full_name: p.data.full_name, phone: p.data.phone, whatsapp: p.data.whatsapp } : null);
      setLicence(p.data?.kyc_status === 'approved' ? (p.data.licence_categories as string[] | null) ?? [] : null);
      const ok = p.data?.kyc_status === 'approved' && p.data.licence_expires_on && new Date(p.data.licence_expires_on) > new Date();
      setKyc(ok ? 'verified' : s.data?.length ? 'pending' : 'none');
    });
  }, [session]);
  // A verified rider whose licence lacks this vehicle's category can't book it (the server refuses too).
  const notCovered = !!bike && licence != null && !licenceCovers(licence, bike.kind);

  const here = `/book?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}${bikeId ? `&bike=${bikeId}` : ''}&helmets=${helmets}&step=${step}`;

  // A number to call: the account's, or typed here.
  const needPhone = !session || (me != null && !me.phone);
  const mobile = normPhone(phone);
  const detailsOk = (!needPhone || !!mobile) && (!!session || guestName.trim().length >= 2)
    && (handover === 'counter' || address.trim().length >= 5);

  async function book() {
    if (!quote) return;
    setBooking(true); setError(null);
    const delivery = { handover, deliveryAddress: handover === 'delivery' ? address.trim() : undefined };
    try {
      if (!session) {
        const r = await callFunction<GuestBookingResponse>('guest-booking', {
          action: 'book', quoteId: quote.quoteId, acceptedTermsVersion: TERMS_VERSION, name: guestName.trim(), phone: mobile, ...delivery,
        });
        setGuestResult({ ...r, guest: { phone: mobile!, handover, address: delivery.deliveryAddress ?? null } });
        return;
      }
      setResult(await callFunction<CreateBookingResponse>('create-booking', {
        quoteId: quote.quoteId, acceptedTermsVersion: TERMS_VERSION, ...delivery, ...(needPhone && mobile ? { phone: mobile } : {}),
      }));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'LICENCE_EXPIRES') {
        setError(e.message);
        return router.push({ pathname: '/verify', params: { next: here } });
      }
      if (e instanceof ApiError && (e.code === 'QUOTE_EXPIRED' || e.code === 'JUST_TAKEN')) setQuote(null);
      setError(e instanceof ApiError ? e.message : 'Booking failed. You have not been charged.');
    } finally { setBooking(false); }
  }

  if (result && bike) {
    return <Reserved booking={result.booking} bankTransfer={result.payment.provider === 'bank_transfer'} vehicle={bike} title={`${bike.make} ${bike.model}`} />;
  }
  if (guestResult && bike) {
    return <Reserved booking={guestResult.booking} bankTransfer={false} guest={guestResult.guest} vehicle={bike} title={`${bike.make} ${bike.model}`} />;
  }

  const price = quote ? money(quote.total, quote.currency)
    : bike && estimate(bike) != null ? money(estimate(bike)!, bike.price_plans!.currency) : null;
  const firstName = me?.full_name?.trim().split(/\s+/)[0];
  const freeCount = shown && free ? shown.filter((b) => free.has(b.id)).length : 0;
  const freeList = shown && free ? shown.filter((b) => free.has(b.id)) : null;

  /** One screen = one question: a short lead line, a big question, the answer, one button. */
  const screen = (lead: string, question: string, body: React.ReactNode) => (
    <Animated.View key={step} entering={FadeInRight.duration(240)} style={styles.stepBody}>
      {step > firstStep && (
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
          {bike ? <Plate size="sm">{bike.plate}</Plate> : <ThemedText type="small" themeColor="textSecondary">Vehicle</ThemedText>}
        </View>
        <ThemedText type="heading" themeColor={bike ? 'text' : 'textSecondary'}>{bike ? `${bike.make} ${bike.model}` : 'Not chosen yet'}</ThemedText>
      </View>
      <View style={[styles.ticketPad, styles.dashed, { borderColor: t.border }]}>
        <View style={styles.rowBetween}>
          <View><ThemedText type="small" themeColor="textSecondary">Pickup</ThemedText><ThemedText type="smallBold">{dateTime(start)}</ThemedText></View>
          <View style={styles.connector}>
            <View style={[styles.dot, { backgroundColor: t.accent }]} />
            <View style={[styles.connLine, { backgroundColor: t.accent }]} />
            <View style={[styles.dot, { backgroundColor: step >= 2 ? t.accent : t.border }]} />
          </View>
          <View style={{ alignItems: 'flex-end' }}><ThemedText type="small" themeColor="textSecondary">Return</ThemedText><ThemedText type="smallBold">{step >= 2 ? dateTime(end) : '—'}</ThemedText></View>
        </View>
        <ThemedText type="small" themeColor="textSecondary">{step >= 2 ? lengthLabel(hours) : 'Return time next'}{step >= 4 && !isCar ? (helmets ? `, ${helmets} helmet${helmets > 1 ? 's' : ''}` : ', no helmet') : ''}</ThemedText>
      </View>
      <View style={[styles.ticketPad, styles.dashed, styles.rowBetween, { borderColor: t.border }]}>
        <View style={styles.flex}><ThemedText type="small" themeColor="textSecondary">Rider</ThemedText><ThemedText type="smallBold">{me?.full_name || guestName.trim() || '—'}</ThemedText></View>
        <View style={[styles.flex, { alignItems: 'flex-end' }]}><ThemedText type="small" themeColor="textSecondary">Mobile</ThemedText><ThemedText type="smallBold">{phoneLabel(me?.phone || me?.whatsapp) || (mobile ? phoneLabel(mobile) : '—')}</ThemedText></View>
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
        <Pressable onPress={() => router.replace('/')} accessibilityRole="link" accessibilityLabel="EasyRide home" style={styles.brand}>
          <BrandMark size={30} />
          <ThemedText type="smallBold" style={{ fontSize: 17 }}>EasyRide</ThemedText>
        </Pressable>
        <ThemedText type="small" themeColor="textSecondary" style={{ marginLeft: 'auto' }}>{step - firstStep + 1} of {STEPS.length - firstStep}</ThemedText>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" accessibilityLabel="Close booking" hitSlop={10} style={styles.close}>
          <ThemedText style={{ fontSize: 24, lineHeight: 26 }}>×</ThemedText>
        </Pressable>
      </View>
      <View style={[styles.progress, { backgroundColor: t.border }]} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: STEPS.length - firstStep, now: step - firstStep + 1 }}>
        <View style={{ width: `${((step - firstStep + 1) / (STEPS.length - firstStep)) * 100}%`, height: '100%', backgroundColor: t.accent }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, wide && styles.scrollWide]} keyboardShouldPersistTaps="handled">
        <View style={[styles.main, wide && { flex: 1 }]}>
          {step === 0 && hasBoth && screen(
            firstName ? `Hi ${firstName}, let’s get you riding. It takes about a minute.` : 'Let’s get you riding. It takes about a minute.',
            'What would you like to ride?',
            <View style={[styles.kindRow, wide && { flexDirection: 'row' }]}>
              {(['bike', 'car'] as const).map((k) => {
                const list = (bikes ?? []).filter((b) => kindOf(b) === k);
                const pic = list.find((b) => showsCutout(b)) ?? list[0];
                const from = Math.min(...list.map((b) => b.price_plans?.daily ?? Infinity));
                const blocked = licence != null && !licenceCovers(licence, k === 'car' ? 'car' : 'motorbike');
                const on = type === k;
                return (
                  <Pressable key={k} onPress={() => pickType(k)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                    style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.kindCard, { borderColor: on || hovered ? t.accent : t.border, backgroundColor: t.backgroundElement, opacity: pressed ? 0.85 : 1 }]}>
                    {pic && <BikeImage vehicle={pic} style={styles.kindPic} />}
                    <ThemedText type="heading">{k === 'car' ? 'A car' : 'A bike'}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {k === 'car' ? 'For passengers and longer trips.' : 'Scooters and motorbikes, easy to park.'}
                      {Number.isFinite(from) ? ` From ${money(from, list[0]?.price_plans?.currency ?? 'MVR')} a day.` : ''}
                    </ThemedText>
                    {blocked && <ThemedText type="small" style={{ color: t.danger }}>Your verified licence doesn’t include category {k === 'car' ? 'B' : 'A'} yet.</ThemedText>}
                  </Pressable>
                );
              })}
            </View>,
          )}
          {step === 0 && !bikes && <ActivityIndicator color={t.accent} />}

          {step === 1 && screen(
            type ? `${type === 'car' ? 'A car' : 'A bike'}, good.` : firstName ? `Hi ${firstName}, let’s get you riding. It takes about a minute.` : 'Let’s get you riding. It takes about a minute.',
            'When do you want to pick up?',
            <>
              <DateTimePicker value={start} onChange={setStart} min={earliest} days={MAX_RENTAL_DAYS} />
              <ThemedText type="small" themeColor="textSecondary">Our counter is open 07:00 to 22:00.</ThemedText>
              <Button title="Continue" onPress={() => go(2)} />
            </>,
          )}

          {step === 2 && screen(
            `Pickup ${dateTime(start)}.`,
            'When will you bring it back?',
            <>
              <View style={styles.chips}>
                {DURATIONS.map((d) => (
                  <Choice key={d.label} label={d.label} selected={d.hours === hours} onPress={() => set({ end: new Date(+start + d.hours * 3_600_000).toISOString() })} />
                ))}
              </View>
              <DateTimePicker value={end} onChange={(d) => set({ end: d.toISOString() })} min={minEnd} days={MAX_RENTAL_DAYS + 1} />
              <Button title={free == null ? `See available ${noun(shown)}` : freeCount ? `See ${freeCount} available ${noun(freeList, freeCount)}` : `See ${noun(shown)}`}
                onPress={() => go(3)} disabled={hours > MAX_RENTAL_DAYS * 24} />
            </>,
          )}

          {step === 3 && screen(
            `${dateTime(start)} to ${dateTime(end)}.`,
            `Which ${noun(freeList?.length ? freeList : shown, 1)} would you like?`,
            !bikes || !free ? <ActivityIndicator color={t.accent} /> : (
              <BikeList bikes={shown!} free={free} selected={bikeId} estimate={estimate}
                nextFree={(b) => (busy ? nextFree(busy.filter((w) => w.id === b.id), start, +end - +start) : null)}
                onPick={(id) => set({ bike: id, step: '4' })}
                onPickAt={(id, s) => set({ bike: id, start: s.toISOString(), end: new Date(+s + (+end - +start)).toISOString(), step: '4' })}
                onChangeTimes={() => go(1)} />
            ),
          )}

          {step === 4 && bike && screen(
            `${bike.make} ${bike.model}, good choice.`,
            isCar ? 'Ready for your price?' : 'Would you like a helmet?',
            <>
              {isCar ? (
                <ThemedText themeColor="textSecondary">
                  You’ll need a driving licence valid for cars. The car comes with a full check at pickup; return it with the same fuel level.
                </ThemedText>
              ) : (
                <>
                  <ThemedText themeColor="textSecondary">
                    Helmets aren’t required in Kulhudhuffushi, so the bike comes without one. Ask for one if you’d like it
                    {helmetPrice != null ? `, ${money(helmetPrice, bike.price_plans?.currency ?? 'MVR')} a day each` : ''}.
                  </ThemedText>
                  <View style={styles.chips}>
                    {[0, 1, 2].map((n) => <Choice key={n} label={n === 0 ? 'No helmet' : n === 1 ? '1 helmet' : '2 helmets'} selected={n === helmets} onPress={() => set({ helmets: String(n) })} />)}
                  </View>
                </>
              )}
              {notCovered ? (
                <View style={{ gap: Spacing.two }}>
                  <ThemedText style={{ color: t.danger }}>
                    Your verified licence doesn’t include category {licenceCategoryFor(bike.kind)} ({LICENCE_CATEGORIES[licenceCategoryFor(bike.kind)].short.toLowerCase()}), which this {isCar ? 'car' : 'bike'} needs.
                    If your licence has it, message us and we’ll add it after checking.
                  </ThemedText>
                  <Button variant="secondary" title="Choose another vehicle" onPress={() => go(3)} />
                </View>
              ) : (
                <Button title={quoting ? 'Getting your price…' : 'Continue'} onPress={() => go(5)} disabled={!quote} loading={quoting} />
              )}
              <ErrorText>{error}</ErrorText>
            </>,
          )}

          {step === 5 && bike && screen(
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
              {quote && (
                <Card style={{ gap: Spacing.three }}>
                  <ThemedText type="smallBold">How do you want to get it?</ThemedText>
                  <View style={styles.chips}>
                    <Choice label="Pick up at the counter" selected={handover === 'counter'} onPress={() => setHandover('counter')} />
                    <Choice label="Deliver it to me" selected={handover === 'delivery'} onPress={() => setHandover('delivery')} />
                  </View>
                  {handover === 'delivery' && (
                    <Field label="Where should we bring it?" value={address} onChangeText={setAddress} placeholder="House name, street, landmark"
                      hint="Anywhere in Kulhudhuffushi. We’ll confirm the time when we call." autoComplete="street-address" />
                  )}
                  {!session && (
                    <>
                      <Field label="Your name" value={guestName} onChangeText={setGuestName} autoComplete="name" textContentType="name" />
                      <ThemedText type="small" themeColor="textSecondary">
                        No account needed.{' '}
                        <ThemedText type="small" themeColor="accent" onPress={() => router.push({ pathname: '/sign-in', params: { next: here } })}
                          accessibilityRole="link" style={{ textDecorationLine: 'underline' }}>Sign in</ThemedText> instead to pay by transfer in the app and see your rentals.
                      </ThemedText>
                    </>
                  )}
                  {needPhone && (
                    <Field label="Mobile number" value={phone} onChangeText={setPhone} placeholder="777 1234" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber"
                      hint={phone && !mobile ? '7 digits, or with the country code (+44…) if it isn’t a Maldivian number.' : 'We call this number to confirm and take payment.'} />
                  )}
                </Card>
              )}
              {!session ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Your booking is held while we call you to confirm and take payment (by transfer or at the counter). Bring your driving licence and ID at pickup.
                </ThemedText>
              ) : kyc && kyc !== 'verified' && (
                <Card style={{ borderColor: t.warning, gap: Spacing.two }}>
                  <Pill label={kyc === 'pending' ? 'Verification under review' : 'Not verified yet'} tone="warning" />
                  <ThemedText type="small">{kyc === 'pending'
                    ? 'We’re checking your documents. You can book now; we’ll finish before pickup.'
                    : 'You can book now. Verify your licence and ID before pickup to save time at the counter, or bring them with you.'}</ThemedText>
                  {kyc === 'none' && <Button variant="secondary" title="Verify my identity" onPress={() => router.push({ pathname: '/verify', params: { next: here } })} />}
                </Card>
              )}
              <ErrorText>{quote ? error : null}</ErrorText>
              {quote && <Button title={`${session ? 'Book' : 'Request booking'} for ${money(quote.total, quote.currency)}`} onPress={book} disabled={!accepted || !detailsOk} loading={booking} />}
            </>,
          )}

          {step >= 4 && !bike && bikes && (
            <Card style={{ gap: Spacing.two }}>
              <ThemedText>Choose what you’d like to ride first.</ThemedText>
              <Button variant="secondary" title={`Pick a ${noun(bikes, 1)}`} onPress={() => go(3)} />
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
            <BikeImage vehicle={b} style={styles.bikePhoto} faded />
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
          <ThemedText>{bikes.length === 1 ? `Our ${noun(bikes, 1)} is booked for these times.` : `All ${noun(bikes)} are booked for these times.`}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Pick different times, or book when one is free again below.</ThemedText>
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
              <BikeImage vehicle={b} style={styles.bikePhoto} />
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
  kindRow: { gap: Spacing.three },
  kindCard: { flex: 1, borderWidth: 1.5, borderRadius: 18, padding: Spacing.three, gap: Spacing.one },
  kindPic: { width: '100%', height: 140, borderRadius: 12 },
  bikePhoto: { width: 128, height: 96, borderRadius: Radius.sm },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  totalLine: { borderTopWidth: 1, paddingTop: Spacing.two, marginTop: Spacing.one },
});

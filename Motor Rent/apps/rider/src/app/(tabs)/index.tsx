import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { KenBurns, StockPhotos, vehiclePhotos, type VehicleKind } from '@/components/photo';
import { Plate } from '@/components/plate';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, Pill, PressableScale } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Radius, Spacing, TopNavInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { statusOf } from '@/lib/booking-status';
import { dateTime, money, parseRange } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useSiteSettings } from '@/lib/site';
import { supabase } from '@/lib/supabase';

type Row = {
  id: string; reference: string; status: string; period: string; total: number; currency: 'MVR' | 'USD'; held_until: string | null;
  vehicles: { make: string; model: string; plate: string; kind: VehicleKind; photos: string[] } | null;
};
type Me = { full_name: string | null; kyc_status: string; licence_expires_on: string | null };
const LIVE = ['held', 'confirmed', 'active', 'overdue'];
const DONE = ['returned', 'closed', 'damage_claim'];

/** Home: a short welcome for visitors; a personal dashboard for signed-in riders. Bikes are chosen inside the booking flow. */
export default function HomeScreen() {
  const { session } = useSession();
  const { width } = useWindowDimensions();
  const wide = width >= 640;
  const [me, setMe] = useState<Me | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pendingCheck, setPendingCheck] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!session) { setMe(null); setRows(null); return; }
    setLoading(true);
    const uid = session.user.id;
    const [p, b, k] = await Promise.all([
      supabase.from('profiles').select('full_name, kyc_status, licence_expires_on').eq('id', uid).single(),
      supabase.from('bookings').select('id, reference, status, period, total, currency, held_until, vehicles(make, model, plate, kind, photos)')
        .eq('rider_id', uid).order('created_at', { ascending: false }).limit(30),
      supabase.from('kyc_submissions').select('status').eq('profile_id', uid).eq('status', 'pending').limit(1),
    ]);
    setMe((p.data as Me | null) ?? null);
    setRows((b.data as unknown as Row[] | null) ?? []);
    setPendingCheck(!!k.data?.length);
    setLoading(false);
  }, [session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.list}
        refreshControl={Platform.OS !== 'web' && session ? <RefreshControl refreshing={loading} onRefresh={load} /> : undefined}>
        <Hero wide={wide} name={session ? firstName(me?.full_name) : null} signedIn={!!session} />
        {session ? <Dashboard me={me} rows={rows} pendingCheck={pendingCheck} /> : <Welcome />}
      </ScrollView>
    </ThemedView>
  );
}

const firstName = (n?: string | null) => (n?.trim() ? n.trim().split(/\s+/)[0]! : '');

function Hero({ wide, name, signedIn }: { wide: boolean; name: string | null; signedIn: boolean }) {
  const t = useTheme();
  const site = useSiteSettings();
  const custom = site?.hero_image_url;
  const credit = custom ? site?.hero_credit : 'Sinamalé Bridge, photo by Panda 51 (CC BY-SA 4.0)';
  const height = (signedIn ? (wide ? 300 : 260) : (wide ? 460 : 420)) + TopNavInset;
  const headline = signedIn ? (name ? `Hi, ${name}.` : 'Welcome back.') : 'Ride Kulhudhuffushi.';
  return (
    <View style={styles.heroWrap}>
      <KenBurns source={custom ? { uri: custom } : StockPhotos.hero} height={height} focus={{ top: custom ? '50%' : '55%', left: '50%' }} scrimTop={0.15} scrimBottom={0.85}>
        <View style={[styles.heroText, { paddingBottom: wide ? Spacing.five : Spacing.four }]}>
          <Animated.View entering={FadeInUp.duration(700)} style={styles.heroInner}>
            <ThemedText type="title" style={[styles.onPhoto, { fontSize: wide ? 68 : 44, lineHeight: wide ? 66 : 44, maxWidth: 620 }]}>{headline}</ThemedText>
            <View style={[styles.roadLine, { backgroundColor: t.cta }]} />
            {!signedIn && (
              <ThemedText style={[styles.onPhotoMuted, { fontSize: 17, lineHeight: 25, maxWidth: 420 }]}>
                Scooters and motorbikes by the hour or the day. Choose your times, pick a bike, collect the keys.
              </ThemedText>
            )}
            <View style={{ alignSelf: 'flex-start', minWidth: 220 }}>
              <Button title="Book a ride" onPress={() => router.push('/book')} />
            </View>
          </Animated.View>
        </View>
        {!!credit && <ThemedText type="small" style={styles.credit} numberOfLines={1}>{credit}</ThemedText>}
      </KenBurns>
    </View>
  );
}

/** Visitors: how booking works, then sign in. */
function Welcome() {
  const t = useTheme();
  const steps = [
    ['Pick your times', 'Pickup and return at our counter, any time from 07:00 to 22:00.'],
    ['Choose a bike', 'You only see bikes that are free for your times, with the full price.'],
    ['Verify once, then ride', 'Upload your licence and ID before your first rental. Show your reference at the counter.'],
  ];
  return (
    <View style={styles.section}>
      <ThemedText type="subtitle">How it works</ThemedText>
      {steps.map(([title, body], i) => (
        <View key={title} style={styles.howRow}>
          <View style={[styles.howNum, { borderColor: t.accent }]}><ThemedText type="smallBold" style={{ color: t.accent }}>{i + 1}</ThemedText></View>
          <View style={styles.flex}>
            <ThemedText type="smallBold" style={{ fontSize: 17 }}>{title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{body}</ThemedText>
          </View>
        </View>
      ))}
      <Button variant="secondary" title="Sign in or create an account" onPress={() => router.push('/sign-in')} />
    </View>
  );
}

function Dashboard({ me, rows, pendingCheck }: { me: Me | null; rows: Row[] | null; pendingCheck: boolean }) {
  const t = useTheme();
  if (!rows) return <View style={[styles.section, { opacity: 0.6 }]}><ThemedText themeColor="textSecondary">Loading your rentals…</ThemedText></View>;

  const now = Date.now();
  const withTimes = rows.map((r) => ({ r, p: parseRange(r.period) }));
  const live = withTimes.filter(({ r }) => LIVE.includes(r.status))
    .sort((a, b) => (a.p?.start.getTime() ?? 0) - (b.p?.start.getTime() ?? 0));
  const past = withTimes.filter(({ r }) => DONE.includes(r.status));
  const rentals = past.length;
  const hours = past.reduce((h, { p }) => h + (p ? Math.max(0, (+p.end - +p.start) / 3_600_000) : 0), 0);
  const spent = past.reduce((s, { r }) => s + (r.currency === 'MVR' ? r.total : 0), 0);

  const licenceOk = me?.licence_expires_on && new Date(me.licence_expires_on) > new Date();
  const verified = me?.kyc_status === 'approved' && licenceOk;
  const licenceSoon = verified && me?.licence_expires_on && +new Date(me.licence_expires_on) - now < 30 * 86_400_000;

  return (
    <View style={styles.section}>
      {!verified && (
        <Card style={{ borderColor: t.warning, gap: Spacing.two }}>
          <Pill label={pendingCheck ? 'Verification under review' : me?.kyc_status === 'approved' ? 'Licence expired' : 'Verification needed'} tone="warning" />
          <ThemedText type="small">{pendingCheck
            ? 'We’re checking your documents, usually within an hour. You can choose your times and bike meanwhile.'
            : me?.kyc_status === 'approved' ? 'Upload your renewed driving licence to keep booking.'
            : 'Upload your driving licence, ID and a selfie once. It takes about 2 minutes.'}</ThemedText>
          {!pendingCheck && <Button variant="secondary" title="Verify my identity" onPress={() => router.push('/verify')} />}
        </Card>
      )}
      {licenceSoon && (
        <Card style={{ gap: Spacing.one }}>
          <Pill label="Licence expires soon" tone="warning" />
          <ThemedText type="small">Your licence expires on {new Date(me!.licence_expires_on!).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}. Upload the renewed one before your next rental.</ThemedText>
        </Card>
      )}

      <ThemedText type="subtitle">{live.length ? (live.length === 1 ? 'Your next ride' : 'Your rides') : 'No rides booked'}</ThemedText>
      {live.length ? live.map(({ r, p }) => <RideCard key={r.id} row={r} start={p?.start} end={p?.end} />) : (
        <Card style={{ gap: Spacing.two }}>
          <ThemedText themeColor="textSecondary">When you book, your pickup time, bike and reference show up here.</ThemedText>
          <Button title="Book a ride" onPress={() => router.push('/book')} />
        </Card>
      )}

      {rentals > 0 && (
        <View style={styles.stats}>
          <Stat value={String(rentals)} label={rentals === 1 ? 'rental' : 'rentals'} />
          <Stat value={hours >= 48 ? `${Math.round(hours / 24)} d` : `${Math.round(hours)} h`} label="on the road" />
          {spent > 0 && <Stat value={money(spent)} label="spent" />}
        </View>
      )}

      {past.length > 0 && (
        <View style={{ gap: Spacing.two }}>
          <View style={styles.headRow}>
            <ThemedText type="smallBold">Recent rentals</ThemedText>
            <ThemedText type="smallBold" themeColor="accent" onPress={() => router.push('/bookings')} accessibilityRole="link">See all</ThemedText>
          </View>
          {past.slice(0, 3).map(({ r, p }) => (
            <PressableScale key={r.id} onPress={() => router.push({ pathname: '/booking/[id]', params: { id: r.id } })} lift={false} scaleTo={0.98}
              style={[styles.pastRow, { borderColor: t.border }]} accessibilityRole="button">
              <View style={styles.flex}>
                <ThemedText type="smallBold">{r.vehicles ? `${r.vehicles.make} ${r.vehicles.model}` : 'Rental'}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{p ? dateTime(p.start) : r.reference}</ThemedText>
              </View>
              <ThemedText type="small">{money(r.total, r.currency)}</ThemedText>
            </PressableScale>
          ))}
        </View>
      )}

      <View style={styles.quick}>
        <Button variant="secondary" title="My rentals" onPress={() => router.push('/bookings')} />
        <Button variant="secondary" title="Rental terms" onPress={() => router.push('/terms')} />
      </View>
    </View>
  );
}

function RideCard({ row, start, end }: { row: Row; start?: Date; end?: Date }) {
  const t = useTheme();
  const s = statusOf(row.status as never);
  const v = row.vehicles;
  const soon = start && +start - Date.now() < 24 * 3_600_000 && +start > Date.now();
  const note = row.status === 'held'
    ? `Pay to confirm${row.held_until ? ` by ${dateTime(row.held_until)}` : ''}.`
    : row.status === 'active' ? `Return by ${end ? dateTime(end) : 'the agreed time'}.`
    : row.status === 'overdue' ? 'This rental is past its return time. Please bring the bike back or message us.'
    : soon ? 'Pickup is within 24 hours. Bring your licence and show your reference.' : null;
  return (
    <PressableScale onPress={() => router.push({ pathname: '/booking/[id]', params: { id: row.id } })} lift={false} scaleTo={0.985} accessibilityRole="button"
      accessibilityLabel={`${v ? `${v.make} ${v.model}` : 'Rental'}, ${s.label}`}>
      <Card style={styles.ride}>
        {v && <Image source={vehiclePhotos(v)[0]} style={styles.ridePhoto} contentFit="cover" />}
        <View style={{ padding: Spacing.three, gap: Spacing.two }}>
          <View style={styles.headRow}>
            <ThemedText type="heading" style={styles.flex} numberOfLines={1}>{v ? `${v.make} ${v.model}` : 'Rental'}</ThemedText>
            <Pill label={s.label} tone={s.tone} />
          </View>
          <View style={[styles.times, { borderColor: t.border }]}>
            <View style={styles.flex}><ThemedText type="small" themeColor="textSecondary">Pickup</ThemedText><ThemedText type="smallBold">{start ? dateTime(start) : '—'}</ThemedText></View>
            <View style={[styles.flex, { alignItems: 'flex-end' }]}><ThemedText type="small" themeColor="textSecondary">Return</ThemedText><ThemedText type="smallBold">{end ? dateTime(end) : '—'}</ThemedText></View>
          </View>
          <View style={styles.headRow}>
            <Plate size="sm" label="Booking reference">{row.reference}</Plate>
            {v && <ThemedText type="small" themeColor="textSecondary">bike {v.plate}</ThemedText>}
            <ThemedText type="smallBold" style={{ marginLeft: 'auto' }}>{money(row.total, row.currency)}</ThemedText>
          </View>
          {note && <ThemedText type="small" style={{ color: row.status === 'overdue' ? t.danger : t.text }}>{note}</ThemedText>}
        </View>
      </Card>
    </PressableScale>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const t = useTheme();
  return (
    <View style={[styles.stat, { borderColor: t.border, backgroundColor: t.backgroundElement }]}>
      <ThemedText type="heading" style={{ color: t.accent }}>{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: {
    paddingHorizontal: Spacing.three, paddingBottom: BottomTabInset + Spacing.five, gap: Spacing.four,
    maxWidth: MaxContentWidth + Spacing.three * 2, width: '100%', alignSelf: 'center',
  },
  heroWrap: Platform.select({ web: { width: '100vw', marginLeft: 'calc(50% - 50vw)', overflow: 'hidden' } as object, default: { marginHorizontal: -Spacing.three, overflow: 'hidden' } })!,
  heroText: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.three, alignItems: 'center' },
  heroInner: { gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth },
  roadLine: { width: 72, height: 6, borderRadius: 1 },
  onPhoto: { color: '#FFFFFF' },
  onPhotoMuted: { color: 'rgba(255,255,255,0.88)' },
  credit: { position: 'absolute', right: Spacing.three, top: TopNavInset + Spacing.two, fontSize: 10, lineHeight: 13, color: 'rgba(255,255,255,0.7)' },
  section: { gap: Spacing.three, maxWidth: 640, width: '100%' },
  howRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  howNum: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  ride: { padding: 0, overflow: 'hidden', gap: 0 },
  ridePhoto: { height: 150, width: '100%' },
  times: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderStyle: 'dashed', paddingVertical: Spacing.two },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  stats: { flexDirection: 'row', gap: Spacing.two },
  stat: { flex: 1, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.three, gap: 2 },
  pastRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two, borderBottomWidth: 1 },
  quick: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
});

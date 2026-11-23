import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CancelBooking } from '@/components/cancel-booking';
import { Chatter, type ChatterItem } from '@/components/chatter';
import { BikeImage, type VehicleKind } from '@/components/photo';
import { useWebPullToRefresh } from '@/components/pull-to-refresh';
import { RefTag } from '@/components/brand';
import { type Claim, ClaimCard, type Extension, HandoverPhotos, type Inspection, MoreTime } from '@/components/rental-extras';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, ErrorText, Pill } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { statusOf } from '@/lib/booking-status';
import { dateTime, money, parseRange } from '@/lib/format';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Booking = {
  id: string; reference: string; status: string; period: string; total: number; deposit: number | null; currency: 'MVR' | 'USD'; created_at: string;
  vehicles: { make: string; model: string; plate: string; kind: VehicleKind; photos: string[]; price_plans: { hourly: number; daily: number; weekly: number } | null } | null;
  branches: { name: string } | null;
};
type Event = { id: number; from_status: string | null; to_status: string; actor: string | null; note: string | null; at: string };
type Slip = { id: string; status: 'pending' | 'approved' | 'rejected'; amount: number | null; reject_reason: string | null; created_at: string; reviewed_at: string | null };
type Owed = { id: string; kind: string; amount: number; currency: 'MVR' | 'USD'; status: string; idempotency_key: string | null };
type Message = { id: number; author: string; from_staff: boolean; author_name: string | null; author_avatar: string | null; body: string; created_at: string };

const OFFICE = { name: 'EasyRide', mark: 'ER', staff: true, me: false };

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const t = useTheme();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [slips, setSlips] = useState<Slip[]>([]);
  const [owed, setOwed] = useState<Owed[]>([]);
  const [exts, setExts] = useState<Extension[]>([]);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [insp, setInsp] = useState<Inspection[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [me, setMe] = useState<{ full_name: string | null; avatar_path: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const uid = session?.user.id;

  const loadMessages = useCallback(async () => {
    const { data } = await supabase.from('booking_messages')
      .select('id, author, from_staff, author_name, author_avatar, body, created_at').eq('booking_id', id).order('created_at');
    setMessages((data as Message[]) ?? []);
  }, [id]);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    const [b, ev, sl, p, pay, ex, cl, ins] = await Promise.all([
      supabase.from('bookings').select('id, reference, status, period, total, deposit, currency, created_at, vehicles(make, model, plate, kind, photos, colour, price_plans(hourly, daily, weekly)), branches(name)').eq('id', id).maybeSingle(),
      supabase.from('booking_events').select('id, from_status, to_status, actor, note, at').eq('booking_id', id).order('at'),
      supabase.from('transfer_slips').select('id, status, amount, reject_reason, created_at, reviewed_at').eq('booking_id', id),
      supabase.from('profiles').select('full_name, avatar_path').eq('id', uid).single(),
      supabase.from('payments').select('id, kind, amount, currency, status, idempotency_key').eq('booking_id', id).in('kind', ['charge', 'refund']).in('status', ['pending', 'succeeded']),
      supabase.from('booking_extensions').select('id, new_end, status, amount, reason, created_at').eq('booking_id', id).order('created_at'),
      supabase.from('damage_claims').select('items, amount, status, rider_note').eq('booking_id', id).maybeSingle(),
      supabase.from('inspections').select('phase, photo_paths, odometer_km, fuel_level, created_at, checklist').eq('booking_id', id).order('created_at'),
      loadMessages(),
    ]);
    setOwed((pay.data as Owed[]) ?? []);
    setExts((ex.data as Extension[]) ?? []);
    setClaim((cl.data as Claim | null) ?? null);
    setInsp((ins.data as Inspection[]) ?? []);
    setError(b.error || !b.data ? 'We couldn’t find this rental.' : null);
    setBooking(b.data as unknown as Booking | null);
    setEvents((ev.data as Event[]) ?? []);
    setSlips((sl.data as Slip[]) ?? []);
    setMe(p.data);
    setLoading(false);
  }, [id, uid, loadMessages]);

  useEffect(() => { load(); }, [load]);

  // Live: new messages from the office appear without refreshing.
  useEffect(() => {
    if (!uid) return;
    const ch = supabase.channel(`booking-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'booking_messages', filter: `booking_id=eq.${id}` }, () => loadMessages())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, uid, loadMessages]);

  const pull = useWebPullToRefresh(load);

  const items = useMemo<ChatterItem[]>(() => {
    if (!uid) return [];
    const self = { name: me?.full_name || 'You', avatar: me?.avatar_path, staff: false, me: true };
    const who = (actor: string | null) => (actor === uid ? self : OFFICE);
    const out: ChatterItem[] = [];
    for (const e of events) {
      const note = e.note === 'cancelled by rider' ? null : e.note;
      if (e.to_status === 'expired') out.push({ key: `e${e.id}`, at: new Date(e.at), who: OFFICE, kind: 'log', tone: 'neutral', text: 'Reservation expired — it wasn’t paid in time' });
      else out.push({ key: `e${e.id}`, at: new Date(e.at), who: who(e.actor), kind: 'status', from: e.from_status, to: e.to_status, note });
    }
    for (const s of slips) {
      out.push({ key: `s${s.id}`, at: new Date(s.created_at), who: self, kind: 'log', text: 'Uploaded a bank transfer slip' });
      if (s.reviewed_at && s.status === 'approved') out.push({ key: `s${s.id}r`, at: new Date(s.reviewed_at), who: OFFICE, kind: 'log', tone: 'success',
        text: `Payment received${s.amount != null && booking ? ` · ${money(s.amount, booking.currency)}` : ''}` });
      if (s.reviewed_at && s.status === 'rejected') out.push({ key: `s${s.id}r`, at: new Date(s.reviewed_at), who: OFFICE, kind: 'log', tone: 'danger',
        text: 'Transfer slip not accepted', note: s.reject_reason });
    }
    for (const m of messages) {
      out.push({ key: `m${m.id}`, at: new Date(m.created_at), kind: 'message', body: m.body,
        who: m.author === uid ? self : { name: m.author_name ?? 'EasyRide team', avatar: m.author_avatar, staff: m.from_staff, me: false } });
    }
    return out;
  }, [events, slips, messages, me, uid, booking]);

  async function send(body: string) {
    const { error } = await supabase.from('booking_messages').insert({ booking_id: id, body });
    if (error) throw new Error(/too many/.test(error.message) ? 'You’re sending messages too fast. Wait a minute and try again.' : 'Message not sent. Check your connection.');
    await loadMessages();
  }

  if (!session) {
    return (
      <ThemedView style={[styles.flex, styles.center]}>
        <Button title="Sign in to see this rental" onPress={() => router.push('/sign-in')} />
      </ThemedView>
    );
  }

  const r = booking ? parseRange(booking.period) : null;
  const s = booking ? statusOf(booking.status) : null;
  const due = owed.filter((o) => o.kind === 'charge' && o.status === 'pending');
  const owedTotal = due.reduce((sum, o) => sum + o.amount, 0);
  const refundDue = owed.filter((o) => o.kind === 'refund' && o.status === 'pending').reduce((sum, o) => sum + o.amount, 0);
  const refunded = owed.filter((o) => o.kind === 'refund' && o.status === 'succeeded').reduce((sum, o) => sum + o.amount, 0);
  const pendingExt = exts.find((e) => e.status === 'pending') ?? null;
  const lastExt = exts.at(-1);
  const lastDeclined = lastExt?.status === 'declined' ? lastExt : null;
  const canExtend = booking && ['confirmed', 'active', 'overdue'].includes(booking.status);
  const label = (k: string | null) => k?.endsWith(':late-fee') ? 'late return' : k?.endsWith(':damage') ? 'damage' : k?.includes(':ext:') ? 'extra time' : 'fees';
  return (
    <ThemedView style={styles.flex}>
      {pull.indicator}
      <ScrollView ref={pull.attach} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled"
        refreshControl={Platform.OS !== 'web' ? <RefreshControl refreshing={loading} onRefresh={load} /> : undefined}>
        <ErrorText>{error}</ErrorText>
        {booking && s && (
          <Animated.View>
            <Card>
              <View style={styles.row}>
                {booking.vehicles && <BikeImage vehicle={booking.vehicles} style={styles.thumb} />}
                <View style={[styles.flex, { gap: 4 }]}>
                  <ThemedText type="heading">{booking.vehicles?.make} {booking.vehicles?.model}</ThemedText>
                  <Pill label={s.label} tone={s.tone} />
                </View>
              </View>
              {r && (
                <View style={styles.trip}>
                  <Detail label="Pickup" value={dateTime(r.start)} dot={t.success} />
                  <Detail label="Return by" value={dateTime(r.end)} dot={t.accent} />
                </View>
              )}
              <View style={[styles.row, styles.footer, { borderColor: t.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexShrink: 1 }}>
                  <RefTag>{booking.reference}</RefTag>
                  <ThemedText type="small" themeColor="textSecondary">{booking.vehicles?.plate}{booking.branches ? `, ${booking.branches.name}` : ''}</ThemedText>
                </View>
                <ThemedText type="smallBold">{money(booking.total, booking.currency)}</ThemedText>
              </View>
            </Card>
            {booking.status === 'overdue' && r && (
              <Notice tone="danger" title="Please bring the bike back now"
                body={`It was due back ${dateTime(r.end)}. Each started hour late is charged at your bike’s hourly rate, up to a day’s rent for each day. Running late? Send us a message below.`} />
            )}
            {owedTotal > 0 && (
              <Notice tone="warning" title={`To pay: ${money(owedTotal, booking.currency)}`}
                body={`For ${[...new Set(due.map((o) => label(o.idempotency_key)))].join(' and ')}. Pay at the counter or by bank transfer; the office will mark it paid.`} />
            )}
            {refundDue > 0 && (
              <Notice tone="success" title={`Refund on its way: ${money(refundDue, booking.currency)}`}
                body="We pay it back to the account you paid from. Message us below if your bank details have changed." />
            )}
            {refunded > 0 && refundDue === 0 && (
              <Notice tone="success" title={`Refunded ${money(refunded, booking.currency)}`} body="The refund has been paid back to you." />
            )}
            {booking.status === 'held' && (
              <View style={{ marginTop: Spacing.two }}>
                <CancelBooking id={booking.id} reference={booking.reference} onCancelled={load} />
              </View>
            )}
          </Animated.View>
        )}

        {booking && canExtend && r && (
          <MoreTime bookingId={booking.id} start={r.start} end={r.end} overdue={booking.status === 'overdue'} rates={booking.vehicles?.price_plans ?? null}
            currency={booking.currency} pending={pendingExt} lastDeclined={lastDeclined} onChange={load} />
        )}
        {booking && claim && <ClaimCard bookingId={booking.id} claim={claim} currency={booking.currency} onChange={load} />}
        {booking && <HandoverPhotos inspections={insp} />}

        {booking && (
          <Animated.View style={{ gap: Spacing.three }}>
            <ThemedText type="subtitle">History and messages</ThemedText>
            <Chatter items={items} onSend={send} />
          </Animated.View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function Notice({ tone, title, body }: { tone: 'danger' | 'warning' | 'success'; title: string; body: string }) {
  const t = useTheme();
  const c = tone === 'danger' ? t.danger : tone === 'success' ? t.success : t.warning;
  return (
    <View accessibilityRole="alert" style={[styles.notice, { borderColor: c + '66', backgroundColor: c + '14' }]}>
      <ThemedText type="smallBold" style={{ color: c, fontSize: 16 }}>{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{body}</ThemedText>
    </View>
  );
}

function Detail({ label, value, dot }: { label: string; value: string; dot: string }) {
  return (
    <View style={[styles.row, { justifyContent: 'flex-start' }]}>
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <ThemedText type="small" themeColor="textSecondary" style={{ width: 80 }}>{label}</ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  body: { padding: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.four, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  thumb: { width: 64, height: 64, borderRadius: 14 },
  trip: { gap: Spacing.two, marginTop: Spacing.one },
  dot: { width: 8, height: 8, borderRadius: 4 },
  notice: { borderWidth: 1, borderRadius: 14, padding: Spacing.three, gap: 4, marginTop: Spacing.two },
  footer: { borderTopWidth: 1, paddingTop: Spacing.two, marginTop: Spacing.one },
});

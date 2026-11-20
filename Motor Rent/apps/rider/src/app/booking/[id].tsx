import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Chatter, type ChatterItem } from '@/components/chatter';
import { vehiclePhotos, type VehicleKind } from '@/components/photo';
import { useWebPullToRefresh } from '@/components/pull-to-refresh';
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
  vehicles: { make: string; model: string; plate: string; kind: VehicleKind; photos: string[] } | null;
  branches: { name: string } | null;
};
type Event = { id: number; from_status: string | null; to_status: string; actor: string | null; note: string | null; at: string };
type Slip = { id: string; status: 'pending' | 'approved' | 'rejected'; amount: number | null; reject_reason: string | null; created_at: string; reviewed_at: string | null };
type Message = { id: number; author: string; from_staff: boolean; author_name: string | null; author_avatar: string | null; body: string; created_at: string };

const OFFICE = { name: 'Rent a Motor', mark: 'RM', staff: true, me: false };

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const t = useTheme();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [slips, setSlips] = useState<Slip[]>([]);
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
    const [b, ev, sl, p] = await Promise.all([
      supabase.from('bookings').select('id, reference, status, period, total, deposit, currency, created_at, vehicles(make, model, plate, kind, photos), branches(name)').eq('id', id).maybeSingle(),
      supabase.from('booking_events').select('id, from_status, to_status, actor, note, at').eq('booking_id', id).order('at'),
      supabase.from('transfer_slips').select('id, status, amount, reject_reason, created_at, reviewed_at').eq('booking_id', id),
      supabase.from('profiles').select('full_name, avatar_path').eq('id', uid).single(),
      loadMessages(),
    ]);
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
        who: m.author === uid ? self : { name: m.author_name ?? 'Rent a Motor team', avatar: m.author_avatar, staff: m.from_staff, me: false } });
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
  return (
    <ThemedView style={styles.flex}>
      {pull.indicator}
      <ScrollView ref={pull.ref} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled"
        refreshControl={Platform.OS !== 'web' ? <RefreshControl refreshing={loading} onRefresh={load} /> : undefined}>
        <ErrorText>{error}</ErrorText>
        {booking && s && (
          <Animated.View entering={FadeInDown.duration(400)}>
            <Card>
              <View style={styles.row}>
                {booking.vehicles && <Image source={vehiclePhotos(booking.vehicles)[0]} style={styles.thumb} contentFit="cover" transition={300} />}
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
                <ThemedText type="small" themeColor="textSecondary" selectable>Ref {booking.reference} · {booking.vehicles?.plate}{booking.branches ? ` · ${booking.branches.name}` : ''}</ThemedText>
                <ThemedText type="smallBold">{money(booking.total, booking.currency)}</ThemedText>
              </View>
            </Card>
          </Animated.View>
        )}

        {booking && (
          <Animated.View entering={FadeInDown.delay(100).duration(400)} style={{ gap: Spacing.three }}>
            <ThemedText type="heading">History &amp; messages</ThemedText>
            <Chatter items={items} onSend={send} />
          </Animated.View>
        )}
      </ScrollView>
    </ThemedView>
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
  footer: { borderTopWidth: 1, paddingTop: Spacing.two, marginTop: Spacing.one },
});

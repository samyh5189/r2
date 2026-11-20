import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Image } from 'expo-image';

import { StockPhotos, vehiclePhotos, type VehicleKind } from '@/components/photo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TransferPayment } from '@/components/transfer-payment';
import { Button, Card, ErrorText, Pill } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing, TopNavInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dateTime, money, parseRange } from '@/lib/format';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Row = {
  id: string; reference: string; status: string; period: string; total: number; currency: 'MVR' | 'USD'; held_until: string | null;
  vehicles: { make: string; model: string; plate: string; kind: VehicleKind; photos: string[] } | null;
};

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
const STATUS: Record<string, { label: string; tone: Tone }> = {
  held: { label: 'Awaiting payment', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  active: { label: 'On the road', tone: 'accent' },
  overdue: { label: 'Overdue — please return', tone: 'danger' },
  returned: { label: 'Returned', tone: 'neutral' },
  damage_claim: { label: 'Damage review', tone: 'warning' },
  closed: { label: 'Completed', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export default function BookingsScreen() {
  const { session } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('bookings')
      .select('id, reference, status, period, total, currency, held_until, vehicles(make, model, plate, kind, photos)')
      .order('created_at', { ascending: false })
      .limit(50);
    setError(error ? 'Could not load your rentals.' : null);
    setRows((data as unknown as Row[]) ?? []);
    setLoading(false);
  }, [session]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!session) {
    return (
      <EmptyState
        title="Your rides live here"
        body="Sign in to see your bookings, pickup times and receipts."
        action="Sign in"
        onPress={() => router.push('/sign-in')}
      />
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          ListHeaderComponent={
            <Animated.View entering={FadeInDown.duration(400)} style={{ gap: Spacing.one }}>
              <ThemedText type="subtitle">My rentals</ThemedText>
              <ErrorText>{error}</ErrorText>
            </Animated.View>
          }
          ListEmptyComponent={!loading ? (
            <EmptyState inline title="No rides yet" body="Your first ride is one tap away." action="Find a bike" onPress={() => router.navigate('/')} />
          ) : undefined}
          renderItem={({ item, index }) => <RentalCard row={item} index={index} />}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function RentalCard({ row, index }: { row: Row; index: number }) {
  const t = useTheme();
  const r = parseRange(row.period);
  const s = STATUS[row.status] ?? { label: row.status, tone: 'neutral' as Tone };
  const live = row.status === 'active' || row.status === 'overdue' || row.status === 'confirmed';
  return (
    <Animated.View entering={FadeInDown.delay(index * 70).duration(450).springify()}>
      <Card>
        <View style={styles.line}>
          {row.vehicles && <Image source={vehiclePhotos(row.vehicles)[0]} style={styles.thumb} contentFit="cover" transition={300} />}
          <View style={styles.flex}>
            <ThemedText type="heading">{row.vehicles?.make} {row.vehicles?.model}</ThemedText>
            <Pill label={s.label} tone={s.tone} />
          </View>
        </View>
        {r && (
          <ThemedText type="small" themeColor="textSecondary">{dateTime(r.start)}  →  {dateTime(r.end)}</ThemedText>
        )}
        {r && live && <RideProgress start={r.start} end={r.end} color={row.status === 'overdue' ? t.danger : t.accent} />}
        <View style={[styles.line, styles.footer, { borderColor: t.border }]}>
          <ThemedText type="small" themeColor="textSecondary" selectable>Ref {row.reference} · {row.vehicles?.plate}</ThemedText>
          <ThemedText type="smallBold">{money(row.total, row.currency)}</ThemedText>
        </View>
      </Card>
      {row.status === 'held' && <View style={{ marginTop: Spacing.two }}><TransferPayment booking={row} /></View>}
    </Animated.View>
  );
}

/** A little road with the scooter placed at how far through the rental we are. */
function RideProgress({ start, end, color }: { start: Date; end: Date; color: string }) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const [w, setW] = useState(0);
  const pct = Math.min(1, Math.max(0, (Date.now() - start.getTime()) / (end.getTime() - start.getTime())));
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = reduce ? pct : withTiming(pct, { duration: 1200, easing: Easing.out(Easing.cubic) });
  }, [pct, reduce, p]);
  const fill = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: Math.max(0, p.value * w - 7) }] }));
  const notStarted = pct === 0;
  return (
    <View style={{ gap: Spacing.one, marginTop: Spacing.one }}>
      <View style={[styles.track, { backgroundColor: t.backgroundSelected }]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <Animated.View style={[styles.trackFill, { backgroundColor: color }, fill]} />
        <Animated.View style={[styles.knob, { backgroundColor: color, borderColor: t.backgroundElement }, knob]} />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {notStarted ? 'Ride starts soon' : `${Math.round(pct * 100)}% of your rental used`}
      </ThemedText>
    </View>
  );
}

function EmptyState({ title, body, action, onPress, inline }: { title: string; body: string; action: string; onPress: () => void; inline?: boolean }) {
  const t = useTheme();
  const content = (
    <Animated.View entering={FadeInDown.duration(500)} style={styles.empty}>
      <View style={[styles.emptyArt, { borderColor: t.border }]}>
        <Image source={StockPhotos.hero} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={{ top: '55%', left: '50%' }} transition={400} />
      </View>
      <ThemedText type="heading" style={{ textAlign: 'center' }}>{title}</ThemedText>
      <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>{body}</ThemedText>
      <Button title={action} onPress={onPress} />
    </Animated.View>
  );
  if (inline) return content;
  return <ThemedView style={[styles.flex, styles.center]}>{content}</ThemedView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: Spacing.four, paddingTop: TopNavInset },
  list: {
    padding: Spacing.three, paddingTop: TopNavInset + Spacing.three, paddingBottom: BottomTabInset + Spacing.five,
    gap: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center',
  },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  footer: { borderTopWidth: 1, paddingTop: Spacing.two, marginTop: Spacing.one },
  thumb: { width: 64, height: 64, borderRadius: 14 },
  track: { height: 8, borderRadius: 4, justifyContent: 'center' },
  knob: { position: 'absolute', left: 0, width: 14, height: 14, borderRadius: 7, borderWidth: 3 },
  trackFill: { height: '100%', borderRadius: 4 },
  empty: { alignItems: 'center', gap: Spacing.three, maxWidth: 380, width: '100%', alignSelf: 'center', paddingVertical: Spacing.four },
  emptyArt: { width: 240, height: 170, borderRadius: 28, overflow: 'hidden', borderWidth: 1 },
});


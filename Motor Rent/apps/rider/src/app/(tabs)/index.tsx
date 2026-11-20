import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

import { KenBurns, StockPhotos, vehiclePhotos, ZoomPhoto, type VehicleKind } from '@/components/photo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card, ErrorText, Pill, PressableScale } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Radius, Spacing, TopNavInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { money } from '@/lib/format';
import { supabase } from '@/lib/supabase';

type Bike = {
  id: string;
  kind: VehicleKind;
  make: string;
  model: string;
  engine_cc: number | null;
  photos: string[];
  branches: { name: string } | null;
  price_plans: { hourly: number; daily: number; currency: 'MVR' | 'USD' } | null;
};

const KIND_LABEL: Record<VehicleKind, string> = { scooter: 'Scooter', motorbike: 'Motorbike', car: 'Car' };
type Filter = 'all' | VehicleKind;

export default function BikesScreen() {
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const { width } = useWindowDimensions();
  const wide = width >= 640;

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vehicles')
      .select('id, kind, make, model, engine_cc, photos, branches(name), price_plans(hourly, daily, currency)')
      .eq('status', 'active')
      .order('make');
    setError(error ? 'Could not load vehicles. Pull to retry.' : null);
    setBikes((data as unknown as Bike[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const kinds = useMemo(() => [...new Set(bikes.map((b) => b.kind))], [bikes]);
  const shown = filter === 'all' ? bikes : bikes.filter((b) => b.kind === filter);
  const cheapest = bikes.reduce<number | null>((m, b) => {
    const h = b.price_plans?.hourly;
    return h == null ? m : m == null ? h : Math.min(m, h);
  }, null);

  return (
    <ThemedView style={styles.flex}>
      <FlatList
        data={shown}
        keyExtractor={(b) => b.id}
        numColumns={wide ? 2 : 1}
        key={wide ? 'grid' : 'list'}
        columnWrapperStyle={wide ? { gap: Spacing.three } : undefined}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListHeaderComponent={
          <View style={{ gap: Spacing.three, marginBottom: Spacing.one }}>
            <Hero count={bikes.length} from={cheapest} wide={wide} />
            <View style={styles.sectionHead}>
              <ThemedText type="heading">Ready to ride</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {loading ? 'Loading…' : `${shown.length} available`}
              </ThemedText>
            </View>
            {kinds.length > 1 && (
              <View style={styles.filters}>
                {(['all', ...kinds] as Filter[]).map((k) => (
                  <FilterChip key={k} label={k === 'all' ? 'All' : `${KIND_LABEL[k]}s`} selected={filter === k} onPress={() => setFilter(k)} />
                ))}
              </View>
            )}
            <ErrorText>{error}</ErrorText>
          </View>
        }
        ListEmptyComponent={loading ? <Skeletons wide={wide} /> : !error ? (
          <Card style={{ alignItems: 'center', paddingVertical: Spacing.five }}>
            <ThemedText themeColor="textSecondary">Everything is out on the road. Check back soon.</ThemedText>
          </Card>
        ) : undefined}
        renderItem={({ item, index }) => <BikeCard bike={item} index={index} wide={wide} />}
      />
    </ThemedView>
  );
}

function Hero({ count, from, wide }: { count: number; from: number | null; wide: boolean }) {
  const height = (wide ? 460 : 420) + TopNavInset;
  return (
    <View style={styles.heroWrap}>
      <KenBurns source={StockPhotos.hero} height={height} focus={{ top: '58%', left: '50%' }} scrimTop={0.7} scrimBottom={0.35}>
        <View style={[styles.heroText, { paddingTop: TopNavInset + (wide ? Spacing.five : Spacing.four) }]}>
          <Animated.View entering={FadeInUp.duration(700)}>
            <ThemedText type="eyebrow" style={styles.onPhotoMuted}>Rent a Motor · Kulhudhuffushi</ThemedText>
          </Animated.View>
          <Animated.View entering={FadeInUp.delay(120).duration(700)}>
            <ThemedText type="title" style={[styles.onPhoto, { fontSize: wide ? 58 : 36, lineHeight: wide ? 60 : 40 }]}>
              Ride Kulhudhuffushi.
            </ThemedText>
          </Animated.View>
          <Animated.View entering={FadeInUp.delay(220).duration(700)}>
            <ThemedText style={[styles.onPhotoMuted, { maxWidth: 440 }]}>
              Kulhudhuffushi Motor Rentals — scooters, motorbikes and cars. Pick one, choose your time, collect the keys.
            </ThemedText>
          </Animated.View>
          <Animated.View entering={FadeInUp.delay(320).duration(700)} style={styles.heroStats}>
            <Stat label="ready now" value={count ? String(count) : '—'} />
            <Stat label="from / hour" value={from != null ? money(from) : '—'} />
            <Stat label="to book" value="2 min" />
          </Animated.View>
        </View>
      </KenBurns>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="heading" style={[styles.onPhoto, { fontSize: 18, lineHeight: 22 }]}>{value}</ThemedText>
      <ThemedText type="small" style={[styles.onPhotoMuted, { fontSize: 12, lineHeight: 16 }]}>{label}</ThemedText>
    </View>
  );
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}
      style={[styles.filter, { backgroundColor: selected ? t.text : t.backgroundElement, borderColor: selected ? t.text : t.border }]}>
      <ThemedText type="smallBold" style={{ color: selected ? t.background : t.text }}>{label}</ThemedText>
    </Pressable>
  );
}

function BikeCard({ bike, index, wide }: { bike: Bike; index: number; wide: boolean }) {
  const t = useTheme();
  const [active, setActive] = useState(false);
  const plan = bike.price_plans;
  const photo = vehiclePhotos(bike)[0];
  const stock = !bike.photos?.length;
  return (
    <Animated.View entering={FadeInDown.delay(80 + index * 90).duration(550)} style={wide ? styles.flex : undefined}>
      <Link href={{ pathname: '/bike/[id]', params: { id: bike.id } }} asChild>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${bike.make} ${bike.model}`}
          onHoverIn={() => setActive(true)}
          onHoverOut={() => setActive(false)}>
          <Card style={styles.bikeCard}>
            <View>
              <ZoomPhoto source={photo} active={active} style={styles.photo} />
              <View style={styles.badges}>
                <View style={styles.glassBadge}>
                  <ThemedText type="smallBold" style={styles.badgeText}>{KIND_LABEL[bike.kind]}</ThemedText>
                </View>
                {bike.engine_cc != null && (
                  <View style={styles.glassBadge}>
                    <ThemedText type="smallBold" style={styles.badgeText}>{bike.engine_cc} cc</ThemedText>
                  </View>
                )}
              </View>
              {stock && (
                <View style={styles.stockNote}>
                  <ThemedText type="small" style={[styles.badgeText, { fontWeight: 500 }]}>Representative photo</ThemedText>
                </View>
              )}
            </View>
            <View style={styles.cardBody}>
              <View style={styles.flex}>
                <ThemedText type="heading">{bike.make} {bike.model}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{bike.branches?.name ?? 'Main branch'}</ThemedText>
              </View>
              <Pill label="Available" tone="success" />
            </View>
            {plan && (
              <View style={styles.priceRow}>
                <View style={styles.price}>
                  <ThemedText type="heading" style={{ color: t.accent }}>{money(plan.hourly, plan.currency)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">/hour</ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">{money(plan.daily, plan.currency)} / day</ThemedText>
                <View style={[styles.go, { backgroundColor: active ? t.accent : t.backgroundSelected }]}>
                  <ThemedText type="smallBold" style={{ color: active ? t.accentText : t.text }}>→</ThemedText>
                </View>
              </View>
            )}
          </Card>
        </PressableScale>
      </Link>
    </Animated.View>
  );
}

/** Pulsing placeholders while the catalogue loads. */
function Skeletons({ wide }: { wide: boolean }) {
  const t = useTheme();
  const block = { backgroundColor: t.backgroundSelected, borderRadius: Radius.sm };
  return (
    <View style={[styles.skeletons, wide && { flexDirection: 'row' }]}>
      {[0, 1].map((i) => (
        <Animated.View key={i} entering={FadeInDown.delay(i * 80)} style={styles.flex}>
          <Card style={[styles.bikeCard, styles.pulse]}>
            <View style={[styles.photo, { backgroundColor: t.backgroundSelected }]} />
            <View style={{ padding: Spacing.three, gap: Spacing.two }}>
              <View style={[block, { height: 18, width: '55%' }]} />
              <View style={[block, { height: 14, width: '30%' }]} />
            </View>
          </Card>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: {
    paddingHorizontal: Spacing.three,
    paddingTop: 0,
    paddingBottom: BottomTabInset + Spacing.five,
    gap: Spacing.three,
    maxWidth: MaxContentWidth + Spacing.three * 2,
    width: '100%',
    alignSelf: 'center',
  },
  heroWrap: {
    marginHorizontal: -Spacing.three,
    borderBottomLeftRadius: Radius.lg + 10,
    borderBottomRightRadius: Radius.lg + 10,
    overflow: 'hidden',
  },
  heroText: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: Spacing.four, gap: Spacing.two },
  onPhoto: { color: '#FFFFFF' },
  onPhotoMuted: { color: 'rgba(255,255,255,0.85)' },
  heroStats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  stat: {
    borderRadius: Radius.md, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, minWidth: 96,
    backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
    backdropFilter: 'blur(10px)',
  } as object,
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: Spacing.two },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  filter: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  bikeCard: { padding: 0, overflow: 'hidden', gap: 0 },
  photo: { height: 210, width: '100%' },
  badges: { position: 'absolute', top: Spacing.two, left: Spacing.two, flexDirection: 'row', gap: 6 },
  glassBadge: {
    borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: 'rgba(11,16,32,0.55)', backdropFilter: 'blur(8px)',
  } as object,
  badgeText: { color: '#FFFFFF', fontSize: 12, lineHeight: 16 },
  stockNote: {
    position: 'absolute', bottom: Spacing.two, right: Spacing.two, borderRadius: Radius.pill,
    paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(11,16,32,0.45)',
  },
  cardBody: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, padding: Spacing.three, paddingBottom: Spacing.two },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingBottom: Spacing.three },
  price: { flexDirection: 'row', alignItems: 'baseline', gap: 2, marginRight: 'auto' },
  go: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  skeletons: { gap: Spacing.three },
  pulse: { opacity: 0.7 },
});

import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useWebPullToRefresh } from '@/components/pull-to-refresh';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { KenBurns, StockPhotos, vehiclePhotos, ZoomPhoto, type VehicleKind } from '@/components/photo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Plate } from '@/components/plate';
import { Card, ErrorText, PressableScale } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Radius, Spacing, TopNavInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { money } from '@/lib/format';
import { useSiteSettings } from '@/lib/site';
import { supabase } from '@/lib/supabase';

type Bike = {
  id: string;
  kind: VehicleKind;
  make: string;
  model: string;
  engine_cc: number | null;
  plate: string;
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
      .select('id, kind, make, model, engine_cc, plate, photos, branches(name), price_plans(hourly, daily, currency)')
      .eq('status', 'active')
      .order('make');
    setError(error ? 'Vehicles didn’t load. Pull down to try again.' : null);
    setBikes((data as unknown as Bike[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  const pull = useWebPullToRefresh(load);

  const kinds = useMemo(() => [...new Set(bikes.map((b) => b.kind))], [bikes]);
  const shown = filter === 'all' ? bikes : bikes.filter((b) => b.kind === filter);
  const cheapest = bikes.reduce<number | null>((m, b) => {
    const h = b.price_plans?.hourly;
    return h == null ? m : m == null ? h : Math.min(m, h);
  }, null);

  return (
    <ThemedView style={styles.flex}>
      {pull.indicator}
      <FlatList
        ref={pull.ref}
        data={shown}
        keyExtractor={(b) => b.id}
        numColumns={wide ? 2 : 1}
        key={wide ? 'grid' : 'list'}
        columnWrapperStyle={wide ? { gap: Spacing.three } : undefined}
        contentContainerStyle={styles.list}
        refreshControl={Platform.OS !== 'web' ? <RefreshControl refreshing={loading} onRefresh={load} /> : undefined}
        ListHeaderComponent={
          <View style={{ gap: Spacing.three, marginBottom: Spacing.one }}>
            <Hero count={bikes.length} from={cheapest} wide={wide} />
            <View style={styles.sectionHead}>
              <ThemedText type="subtitle">Free to ride now</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {loading ? 'Checking the yard…' : `${shown.length} of ${bikes.length}`}
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
            <ThemedText themeColor="textSecondary">Every vehicle is out on the road right now. Pull down to check again.</ThemedText>
          </Card>
        ) : undefined}
        renderItem={({ item, index }) => <BikeCard bike={item} index={index} wide={wide} />}
      />
    </ThemedView>
  );
}

function Hero({ count, from, wide }: { count: number; from: number | null; wide: boolean }) {
  const t = useTheme();
  const height = (wide ? 480 : 440) + TopNavInset;
  const site = useSiteSettings();
  const custom = site?.hero_image_url;
  // Default photo is CC BY-SA 4.0 and must be credited.
  const credit = custom ? site?.hero_credit : 'Sinamalé Bridge, photo by Panda 51 (CC BY-SA 4.0)';
  const line = count
    ? `${count} ${count === 1 ? 'vehicle' : 'vehicles'} in the yard${from != null ? `, from ${money(from)} an hour` : ''}.`
    : 'Scooters, motorbikes and cars, by the hour or the day.';
  return (
    <View style={styles.heroWrap}>
      <KenBurns source={custom ? { uri: custom } : StockPhotos.hero} height={height} focus={{ top: custom ? '50%' : '55%', left: '50%' }} scrimTop={0.15} scrimBottom={0.85}>
        <View style={[styles.heroText, { paddingBottom: wide ? Spacing.five : Spacing.four }]}>
          <Animated.View entering={FadeInUp.duration(800)} style={styles.heroInner}>
            <ThemedText type="title" style={[styles.onPhoto, { fontSize: wide ? 76 : 48, lineHeight: wide ? 72 : 46, maxWidth: 620 }]}>
              Ride Kulhudhuffushi.
            </ThemedText>
            <View style={[styles.roadLine, { backgroundColor: t.cta }]} />
            <ThemedText style={[styles.onPhotoMuted, { fontSize: 17, lineHeight: 25, maxWidth: 420 }]}>{line} Pick one, choose your times, collect the keys.</ThemedText>
          </Animated.View>
        </View>
        {!!credit && <ThemedText type="small" style={styles.credit} numberOfLines={1}>{credit}</ThemedText>}
      </KenBurns>
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

function BikeCard({ bike, wide }: { bike: Bike; index: number; wide: boolean }) {
  const t = useTheme();
  const [active, setActive] = useState(false);
  const plan = bike.price_plans;
  const photo = vehiclePhotos(bike)[0];
  const stock = !bike.photos?.length;
  const spec = [KIND_LABEL[bike.kind], bike.engine_cc != null ? `${bike.engine_cc} cc` : null, bike.branches?.name].filter(Boolean).join(', ');
  return (
    <View style={wide ? styles.half : undefined}>
      <Link href={{ pathname: '/bike/[id]', params: { id: bike.id } }} asChild>
        <PressableScale accessibilityRole="button" accessibilityLabel={`${bike.make} ${bike.model}, ${bike.plate}`} scaleTo={0.985} lift={false}
          onHoverIn={() => setActive(true)} onHoverOut={() => setActive(false)}>
          <Card style={[styles.bikeCard, active && { borderColor: t.text }]}>
            <ZoomPhoto source={photo} active={active} style={styles.photo} />
            <View style={styles.cardBody}>
              <View style={styles.nameRow}>
                <ThemedText type="heading" style={styles.flex} numberOfLines={1}>{bike.make} {bike.model}</ThemedText>
                <Plate size="sm" label="Plate">{bike.plate}</Plate>
              </View>
              <ThemedText type="small" themeColor="textSecondary">{spec}{stock ? '. Photo shows the model, not this vehicle.' : ''}</ThemedText>
              {plan && (
                <View style={styles.priceRow}>
                  <ThemedText type="heading" style={{ fontSize: 22 }}>{money(plan.hourly, plan.currency)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">an hour, {money(plan.daily, plan.currency)} a day</ThemedText>
                </View>
              )}
            </View>
          </Card>
        </PressableScale>
      </Link>
    </View>
  );
}

/** Pulsing placeholders while the catalogue loads. */
function Skeletons({ wide }: { wide: boolean }) {
  const t = useTheme();
  const block = { backgroundColor: t.backgroundSelected, borderRadius: Radius.sm };
  return (
    <View style={[styles.skeletons, wide && { flexDirection: 'row' }]}>
      {[0, 1].map((i) => (
        <View key={i} style={styles.flex}>
          <Card style={[styles.bikeCard, styles.pulse]}>
            <View style={[styles.photo, { backgroundColor: t.backgroundSelected }]} />
            <View style={{ padding: Spacing.three, gap: Spacing.two }}>
              <View style={[block, { height: 18, width: '55%' }]} />
              <View style={[block, { height: 14, width: '30%' }]} />
            </View>
          </Card>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  half: { flex: 1, maxWidth: (MaxContentWidth - Spacing.three) / 2 },
  list: {
    paddingHorizontal: Spacing.three,
    paddingTop: 0,
    paddingBottom: BottomTabInset + Spacing.five,
    gap: Spacing.three,
    maxWidth: MaxContentWidth + Spacing.three * 2,
    width: '100%',
    alignSelf: 'center',
  },
  // Full-bleed on web: break out of the centred list column.
  heroWrap: Platform.select({ web: { width: '100vw', marginLeft: 'calc(50% - 50vw)', overflow: 'hidden' } as object, default: { marginHorizontal: -Spacing.three, overflow: 'hidden' } })!,
  heroText: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.three, alignItems: 'center' },
  heroInner: { gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth },
  roadLine: { width: 72, height: 6, borderRadius: 1 },
  onPhoto: { color: '#FFFFFF' },
  credit: { position: 'absolute', right: Spacing.three, top: TopNavInset + Spacing.two, fontSize: 10, lineHeight: 13, color: 'rgba(255,255,255,0.7)' },
  onPhotoMuted: { color: 'rgba(255,255,255,0.88)' },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: Spacing.four },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  filter: { borderWidth: 1, borderRadius: Radius.sm, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  bikeCard: { padding: 0, overflow: 'hidden', gap: 0 },
  photo: { height: 200, width: '100%' },
  cardBody: { padding: Spacing.three, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: Spacing.two, flexWrap: 'wrap' },
  skeletons: { gap: Spacing.three },
  pulse: { opacity: 0.7 },
});

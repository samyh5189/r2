import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { baseRental } from '@motor-rent/shared';

import { ArrowRightIcon } from '@/components/icons';
import { BikeImage, showsCutout, type VehicleKind } from '@/components/photo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PressableScale } from '@/components/ui';
import { BottomTabInset, Fonts, MaxContentWidth, Radius, Spacing, TopNavInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { money } from '@/lib/format';
import { supabase } from '@/lib/supabase';

type Bike = {
  id: string; kind: VehicleKind; photos: string[]; make: string; model: string; engine_cc: number | null;
  price_plans: { hourly: number; daily: number; weekly: number; deposit: number; multiplier: number; currency: 'MVR' | 'USD' } | null;
};
type Model = { key: string; make: string; model: string; kind: VehicleKind; cc: number | null; count: number; daily: number | null; currency: 'MVR' | 'USD'; first: Bike };

const KIND: Record<VehicleKind, string> = { scooter: 'Scooter', motorbike: 'Motorbike', car: 'Car' };

/** Each model in the fleet, shown whole, with its day price. Tapping one starts a booking with it. */
export default function FleetScreen() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const cols = width >= 1000 ? 3 : width >= 680 ? 2 : 1;
  const [models, setModels] = useState<Model[] | null>(null);

  useEffect(() => {
    supabase.from('vehicles')
      .select('id, kind, photos, make, model, engine_cc, price_plans(hourly, daily, weekly, deposit, multiplier, currency)')
      .eq('status', 'active').order('make')
      .then(({ data }) => {
        const groups = new Map<string, Model>();
        for (const b of (data ?? []) as unknown as Bike[]) {
          const key = `${b.make} ${b.model}`.toLowerCase();
          const p = b.price_plans;
          const daily = p ? Math.round(baseRental(24, p) * (Number(p.multiplier) || 1)) : null;
          const g = groups.get(key);
          if (!g) groups.set(key, { key, make: b.make, model: b.model, kind: b.kind, cc: b.engine_cc, count: 1, daily, currency: p?.currency ?? 'MVR', first: b });
          else {
            g.count += 1;
            if (daily != null && (g.daily == null || daily < g.daily)) g.daily = daily;
            if (!g.first.photos?.length && b.photos?.length) g.first = b;
          }
        }
        setModels([...groups.values()]);
      });
  }, []);

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}>
          <ThemedText type="title" accessibilityRole="header" style={[styles.h1, { fontSize: width >= 680 ? 56 : 40, lineHeight: width >= 680 ? 58 : 43 }]}>Pick your bike.</ThemedText>
          <View style={[styles.rule, { backgroundColor: t.accent }]} />
          <ThemedText themeColor="textSecondary" style={styles.lead}>
            Scooters and motorbikes by the hour or the day, collected from our counter in Kulhudhuffushi. Helmets on request.
          </ThemedText>
        </View>

        {!models ? <ActivityIndicator color={t.accent} style={{ marginVertical: Spacing.six }} /> : (
          <View style={[styles.grid, { rowGap: Spacing.three }]}>
            {models.map((m, i) => (
              <Animated.View key={m.key} entering={FadeInDown.delay(i * 70).duration(420)} style={{ width: cols === 1 ? '100%' : `${(100 - (cols - 1) * 2.4) / cols}%` as `${number}%` }}>
                <ModelCard m={m} />
              </Animated.View>
            ))}
          </View>
        )}
        {models && models.length > 0 && (
          <ThemedText type="small" themeColor="textSecondary">Colours and plates depend on which bike is free for your times.</ThemedText>
        )}

        <View style={[styles.cta, { backgroundColor: t.accent }]}>
          <View style={[styles.ctaRing, { borderColor: 'rgba(255,255,255,0.14)' }]} />
          <ThemedText type="title" style={[styles.ctaTitle, { color: t.accentText }]}>Any bike</ThemedText>
          <ThemedText style={{ color: 'rgba(255,255,255,0.88)', fontSize: 17 }}>Choose your times first and we show every bike that’s free.</ThemedText>
          <PressableScale onPress={() => router.push('/book')} accessibilityRole="link" scaleTo={0.97} lift={false}
            style={[styles.ctaBtn, { backgroundColor: '#FFFFFF' }]}>
            <ThemedText type="smallBold" style={{ color: t.accent, fontSize: 16 }}>Book now</ThemedText>
            <ArrowRightIcon color={t.accent} />
          </PressableScale>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function ModelCard({ m }: { m: Model }) {
  const t = useTheme();
  const word = m.model.split(/\s+/)[0]!.toUpperCase();
  const book = () => router.push({ pathname: '/book', params: { bike: m.first.id } });
  const cut = showsCutout(m.first);
  return (
    <PressableScale onPress={book} accessibilityRole="button" accessibilityLabel={`Book the ${m.make} ${m.model}`} scaleTo={0.985}
      style={[styles.card, { backgroundColor: t.backgroundElement, borderColor: t.border }]}>
      {!cut ? (
        <View style={styles.stage}>
          <BikeImage vehicle={m.first} style={StyleSheet.absoluteFill} />
        </View>
      ) : (
      <View style={styles.stage}>
        <ThemedText numberOfLines={1} adjustsFontSizeToFit aria-hidden
          style={[styles.ghost, Platform.OS === 'web'
            ? ({ color: 'transparent', WebkitTextStroke: `1.5px ${t.border}` } as object)
            : { color: t.backgroundSelected }]}>
          {word}
        </ThemedText>
        <BikeImage vehicle={m.first} surface="transparent" fit="contain" style={styles.bike} />
        <View style={[styles.road, { backgroundColor: t.accent }]} />
      </View>
      )}
      <View style={styles.cardBody}>
        <ThemedText type="eyebrow" style={{ color: t.accent }}>{KIND[m.kind]}{m.cc ? `, ${m.cc} cc` : ''}</ThemedText>
        <ThemedText type="heading" style={styles.name}>{m.make} {m.model}</ThemedText>
        <View style={[styles.priceRow, { borderColor: t.border }]}>
          <View style={styles.price}>
            {m.daily != null ? (
              <>
                <ThemedText type="small" themeColor="textSecondary">from</ThemedText>
                <ThemedText style={styles.amount}>{money(m.daily, m.currency)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">/ day</ThemedText>
              </>
            ) : <ThemedText type="small" themeColor="textSecondary">Price on booking</ThemedText>}
          </View>
          <View style={[styles.go, { backgroundColor: t.accent }]}>
            <ArrowRightIcon color={t.accentText} />
          </View>
        </View>
        {m.count > 1 && <ThemedText type="small" themeColor="textSecondary">{m.count} in the fleet</ThemedText>}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: {
    paddingHorizontal: Spacing.three, paddingTop: TopNavInset + Spacing.five, paddingBottom: BottomTabInset + Spacing.six,
    gap: Spacing.four, maxWidth: MaxContentWidth + 160, width: '100%', alignSelf: 'center',
  },
  head: { gap: Spacing.three, maxWidth: 620 },
  h1: { letterSpacing: -1.5 },
  rule: { width: 100, height: 3, borderRadius: 2 },
  lead: { fontSize: 17, lineHeight: 26 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: '2.4%' } as object,
  card: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden', boxShadow: '0 14px 36px rgba(20,10,10,0.08)' } as object,
  stage: { height: 230, alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: Spacing.three },
  ghost: { position: 'absolute', top: Spacing.four, left: Spacing.three, right: Spacing.three, textAlign: 'center', fontFamily: Fonts?.display, fontSize: 64, lineHeight: 70, fontWeight: '800', letterSpacing: -1 },
  bike: { width: '92%', height: 200 },
  road: { height: 3, width: '88%', borderRadius: 2, marginBottom: Spacing.two },
  cardBody: { padding: Spacing.three, paddingTop: Spacing.two, gap: Spacing.one },
  name: { fontSize: 24, lineHeight: 30 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: Spacing.three, marginTop: Spacing.two },
  price: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  amount: { fontFamily: Fonts?.display, fontSize: 24, lineHeight: 28, fontWeight: '800' },
  go: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  cta: { borderRadius: Radius.lg, padding: Spacing.four, gap: Spacing.three, overflow: 'hidden' },
  ctaRing: { position: 'absolute', right: -80, bottom: -120, width: 320, height: 320, borderRadius: 160, borderWidth: 40 },
  ctaTitle: { fontSize: 36, lineHeight: 40 },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, alignSelf: 'flex-start', paddingHorizontal: Spacing.four, paddingVertical: 14, borderRadius: Radius.md },
});

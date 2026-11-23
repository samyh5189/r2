import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent, type ViewStyle } from 'react-native';
import { baseRental, isVehicleColour, VEHICLE_COLOURS, type VehicleColour } from '@motor-rent/shared';

import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { money } from '@/lib/format';
import { supabase } from '@/lib/supabase';

import { ArrowLeftIcon, ArrowRightIcon } from './icons';
import { redLine, Reveal, tr, web } from './page-kit';
import { bikeSource, isCutout, stockPhotoColour, type VehicleKind } from './photo';

import { ThemedText } from './themed-text';

export type Plan = { hourly: number; daily: number; weekly: number; deposit: number; multiplier: number; currency: 'MVR' | 'USD' };
export type Bike = {
  id: string; kind: VehicleKind; photos: string[]; make: string; model: string; engine_cc: number | null;
  price_plans: Plan | null; colour?: string | null;
};
export type Model = {
  key: string; make: string; model: string; kind: VehicleKind; cc: number | null; count: number;
  daily: number | null; currency: 'MVR' | 'USD'; plan: Plan | null; first: Bike;
  /** One bike per recorded colour (the order bikes were listed in). */
  colours: { colour: VehicleColour; bike: Bike }[];
};

const showsOwnCutout = (b: Bike) => isCutout(b.photos?.find(Boolean));

/** Price of `hours` on a plan, with its seasonal multiplier. */
export const planPrice = (plan: Plan, hours: number) => Math.round(baseRental(hours, plan) * (Number(plan.multiplier) || 1));

/** Active bikes grouped by make and model, each with its cheapest day price. */
export function useModels() {
  const [models, setModels] = useState<Model[] | null>(null);
  useEffect(() => {
    const cols = 'id, kind, photos, make, model, engine_cc, price_plans(hourly, daily, weekly, deposit, multiplier, currency)';
    const load = (withColour: boolean) => supabase.from('vehicles')
      .select(withColour ? `${cols}, colour` : cols).eq('status', 'active').order('make').order('plate');
    // Colour is a newer column: fall back to loading without it if the database doesn't have it yet.
    load(true).then(async (first) => (first.error ? load(false) : first)).then(({ data }) => {
        const groups = new Map<string, Model>();
        for (const b of (data ?? []) as unknown as Bike[]) {
          const key = `${b.make} ${b.model}`.toLowerCase();
          const p = b.price_plans;
          const daily = p ? planPrice(p, 24) : null;
          const g = groups.get(key);
          let g2 = g;
          if (!g2) {
            g2 = { key, make: b.make, model: b.model, kind: b.kind, cc: b.engine_cc, count: 1, daily, currency: p?.currency ?? 'MVR', plan: p, first: b, colours: [] };
            groups.set(key, g2);
          } else {
            g2.count += 1;
            if (daily != null && (g2.daily == null || daily < g2.daily)) { g2.daily = daily; g2.plan = p; }
            if (!g2.first.photos?.length && b.photos?.length) g2.first = b;
          }
          const c = b.colour;
          if (isVehicleColour(c)) {
            const have = g2.colours.find((x) => x.colour === c);
            if (!have) g2.colours.push({ colour: c, bike: b });
            else if (!showsOwnCutout(have.bike) && showsOwnCutout(b)) have.bike = b;
          }
        }
        setModels([...groups.values()]);
      });
  }, []);
  return models;
}

/**
 * The fleet as a row of showroom cards you swipe through sideways (snaps card by card).
 * One card a screen on phones with the next one peeking in, two on tablets, three on desktop;
 * dots show where you are and arrows step through on wide screens.
 */
export function ModelCarousel({ models, onView = false, style }: { models: Model[]; onView?: boolean; style?: ViewStyle }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const per = width >= 1024 ? 3 : width >= 640 ? 2 : 1;
  const [boxW, setBoxW] = useState(0);
  const [index, setIndex] = useState(0);
  const ref = useRef<{ scrollTo: (o: { x: number; animated: boolean }) => void } | null>(null);
  const gap = Spacing.three;
  const swipes = models.length > per;
  const cardW = boxW ? ((boxW - gap * (per - 1)) / per) * (per === 1 && swipes ? 0.86 : 1) : 0;
  const step = cardW + gap;
  const last = Math.max(0, per === 1 ? models.length - 1 : models.length - per);
  const go = (i: number) => ref.current?.scrollTo({ x: Math.max(0, Math.min(last, i)) * step, animated: true });
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / step);
    if (i !== index) setIndex(Math.max(0, Math.min(last, i)));
  };

  return (
    <View style={style} onLayout={(e) => setBoxW(e.nativeEvent.layout.width)}>
      {cardW > 0 && (
        <ScrollView ref={ref as never} horizontal showsHorizontalScrollIndicator={false} scrollEnabled={swipes}
          snapToInterval={step} decelerationRate="fast" disableIntervalMomentum onScroll={onScroll} scrollEventThrottle={32}
          style={[styles.track, web && ({ scrollSnapType: 'x mandatory', overscrollBehaviorX: 'contain' } as ViewStyle)]}
          contentContainerStyle={[styles.trackInner, { gap }]}
          accessibilityRole="list" accessibilityLabel="Bikes in the fleet">
          {models.map((m, i) => (
            <View key={m.key} style={[{ width: cardW }, web && ({ scrollSnapAlign: 'start' } as ViewStyle)]}>
              <Reveal onView={onView} delay={80 * (i + 1)} duration={800}>
                <ModelCard m={m} />
              </Reveal>
            </View>
          ))}
        </ScrollView>
      )}
      {swipes && (
        <View style={styles.controls}>
          <View style={styles.dots} accessibilityRole="tablist">
            {Array.from({ length: last + 1 }, (_, i) => (
              <Pressable key={i} onPress={() => go(i)} accessibilityRole="tab" accessibilityLabel={`Bike ${i + 1}`} accessibilityState={{ selected: i === index }} hitSlop={8}
                style={[styles.dot, { width: i === index ? 24 : 8, backgroundColor: i === index ? t.accent : t.textSecondary + '55' }, tr('width, background-color', 350)]} />
            ))}
          </View>
          {width >= 640 && (
            <View style={styles.arrows}>
              <Arrow label="Previous bike" disabled={index === 0} onPress={() => go(index - 1)}><ArrowLeftIcon color={t.text} /></Arrow>
              <Arrow label="Next bike" disabled={index >= last} onPress={() => go(index + 1)}><ArrowRightIcon color={t.text} /></Arrow>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function Arrow({ label, disabled, onPress, children }: { label: string; disabled: boolean; onPress: () => void; children: ReactNode }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.arrow, { borderColor: t.border, backgroundColor: hovered ? t.backgroundSelected : t.backgroundElement },
        disabled && { opacity: 0.35 }, pressed && { transform: [{ scale: 0.95 }] }, tr('background-color', 200)]}>
      {children}
    </Pressable>
  );
}

export function ModelCard({ m }: { m: Model }) {
  const t = useTheme();
  const [hover, setHover] = useState(false);
  const [stageW, setStageW] = useState(0);
  const [pick, setPick] = useState(0);
  const chosen = m.colours[pick];
  const shown = chosen?.bike ?? m.first;
  const { source, cutout } = bikeSource(shown);
  const photoColour = stockPhotoColour(shown);
  // The model name behind the vehicle: whole when short ("MAZDA 2"), else its first word ("AIRBLADE").
  const word = (m.model.length <= 9 ? m.model : m.model.split(/\s+/)[0]!).toUpperCase();
  const book = () => router.push({ pathname: '/book', params: { bike: shown.id } });
  const ink = t.text;
  const wordSize = stageW * 0.19;

  return (
    <Pressable onPress={book} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
      accessibilityRole="link" accessibilityLabel={`Book the ${m.make} ${m.model}`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: t.backgroundElement, borderColor: hover ? t.textSecondary + '55' : t.border },
        web && ({ boxShadow: hover
          ? 'inset 0 1px 0 rgba(255,255,255,0.65), 0 36px 70px -42px rgba(17,16,20,0.5)'
          : 'inset 0 1px 0 rgba(255,255,255,0.65), 0 26px 60px -46px rgba(17,16,20,0.4)' } as ViewStyle),
        { transform: [{ translateY: hover ? -4 : 0 }, { scale: pressed ? 0.99 : 1 }] },
        tr('transform, box-shadow, border-color', 450),
      ]}>
      <View style={styles.stage} onLayout={(e) => setStageW(e.nativeEvent.layout.width)}>
        {stageW > 0 && (
          <View pointerEvents="none" style={[styles.wordBox, { transform: [{ translateX: hover ? stageW * 0.02 : 0 }] }, tr('transform', 700)]}>
            <ThemedText aria-hidden numberOfLines={1}
              style={[styles.word, { fontSize: wordSize, lineHeight: wordSize, letterSpacing: -wordSize * 0.05 },
                web ? ({ color: 'transparent', WebkitTextStroke: `1.5px ${ink}2E`, whiteSpace: 'nowrap' } as object) : { color: ink + '14' }]}>
              {word}
            </ThemedText>
          </View>
        )}
        {cutout ? (
          <>
            <View style={[styles.shot, { transform: [{ translateX: hover ? -stageW * 0.025 : 0 }, { scale: hover ? 1.03 : 1 }] }, tr('transform', 700)]}>
              <Image source={source} style={StyleSheet.absoluteFill} contentFit="contain" contentPosition="bottom" transition={300}
                alt={`${m.make} ${m.model}${chosen ? `, ${VEHICLE_COLOURS[chosen.colour].label.toLowerCase()}` : ''}`} />
            </View>
            <View style={[styles.line, redLine(t.accent)]} />
          </>
        ) : (
          // A real photo: framed in front of the model name, lifting slightly on hover.
          <View style={[styles.frame, { transform: [{ translateY: hover ? -4 : 0 }, { scale: hover ? 1.02 : 1 }] }, tr('transform, box-shadow', 700),
            web && ({ boxShadow: hover ? '0 28px 50px -26px rgba(17,16,20,0.55)' : '0 20px 40px -28px rgba(17,16,20,0.45)' } as ViewStyle)]}>
            <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} alt={`${m.make} ${m.model}`} />
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        <ThemedText style={[styles.kicker, { color: t.accent }]}>{m.cc ? `${m.cc} cc ` : ''}{m.kind}</ThemedText>
        <ThemedText style={[styles.name, { color: t.text }]}>{m.model.toLowerCase().startsWith(m.make.toLowerCase()) ? m.model : `${m.make} ${m.model}`}</ThemedText>
        {m.colours.length > 0 && (
          <View style={styles.swatchRow}>
            <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Colour">
              {m.colours.map((c, i) => {
                const on = i === pick;
                return (
                  <Pressable key={c.colour} onPress={() => setPick(i)} hitSlop={6} disabled={m.colours.length < 2}
                    accessibilityRole="radio" accessibilityLabel={VEHICLE_COLOURS[c.colour].label} accessibilityState={{ checked: on }}
                    style={[styles.swatchRing, { borderColor: on ? t.accent : 'transparent', transform: [{ scale: on ? 1 : 0.92 }] }, tr('border-color, transform', 250)]}>
                    <View style={[styles.swatch, { backgroundColor: VEHICLE_COLOURS[c.colour].hex, borderColor: t.text + '22' }]} />
                  </Pressable>
                );
              })}
            </View>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
              {chosen ? VEHICLE_COLOURS[chosen.colour].label : ''}
              {chosen && photoColour && photoColour !== chosen.colour ? ` · photo shows ${photoColour}` : ''}
            </ThemedText>
          </View>
        )}
        {m.count > 1 && <ThemedText type="small" themeColor="textSecondary">{m.count} in the fleet</ThemedText>}
        <View style={[styles.foot, { borderColor: t.border }]}>
          <View style={styles.price}>
            {m.daily != null ? (
              <>
                <ThemedText style={[styles.muted, { color: t.textSecondary }]}>from</ThemedText>
                <ThemedText style={[styles.fare, { color: t.text }]}>{money(m.daily, m.currency)}</ThemedText>
                <ThemedText style={[styles.muted, { color: t.textSecondary }]}>/ day</ThemedText>
              </>
            ) : <ThemedText style={[styles.muted, { color: t.textSecondary }]}>Price shown when you book</ThemedText>}
          </View>
          <View style={[styles.go, { backgroundColor: t.accent, transform: [{ translateX: hover ? 4 : 0 }] },
            web && ({ boxShadow: `0 10px 24px -12px ${t.accent}99` } as ViewStyle), tr('transform', 350)]}>
            <ArrowRightIcon size={20} color={t.accentText} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  swatchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: -4 },
  swatches: { flexDirection: 'row', gap: 4 },
  swatchRing: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 20, height: 20, borderRadius: 10, borderWidth: 1 },
  track: { marginTop: -Spacing.two, marginBottom: -Spacing.five, marginHorizontal: -Spacing.one },
  trackInner: { paddingTop: Spacing.two, paddingBottom: Spacing.five + Spacing.one, paddingHorizontal: Spacing.one },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.four, minHeight: 44 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { height: 8, borderRadius: 4 },
  arrows: { flexDirection: 'row', gap: Spacing.two },
  arrow: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  stage: { aspectRatio: 5 / 4, width: '100%', overflow: 'hidden' },
  wordBox: { position: 'absolute', top: '13%', left: '-50%', right: '-50%', alignItems: 'center' },
  word: { textAlign: 'center', fontFamily: Fonts?.display, fontWeight: '800' },
  shot: { position: 'absolute', top: '16%', left: '8%', right: '8%', bottom: '3.5%' },
  frame: { position: 'absolute', top: '31%', left: '9%', right: '9%', bottom: '7%', borderRadius: 14, overflow: 'hidden', backgroundColor: '#0001' },
  line: { position: 'absolute', left: '8%', right: '8%', bottom: '7%', height: 3, borderRadius: 999 },
  cardBody: { paddingTop: Spacing.two, paddingHorizontal: Spacing.four, paddingBottom: Spacing.four, gap: 12, flexGrow: 1 },
  kicker: { fontSize: 13, lineHeight: 20, fontWeight: '600', letterSpacing: 13 * 0.18, textTransform: 'uppercase' },
  name: { fontFamily: Fonts?.display, fontSize: 26, lineHeight: 29, fontWeight: '800', letterSpacing: -0.8 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three, borderTopWidth: 1, paddingTop: 14, marginTop: 'auto' },
  price: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', flexShrink: 1 },
  muted: { fontSize: 14, lineHeight: 20 },
  fare: { fontFamily: Fonts?.display, fontSize: 26, lineHeight: 30, fontWeight: '800', letterSpacing: -0.8, marginHorizontal: 6 },
  go: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});

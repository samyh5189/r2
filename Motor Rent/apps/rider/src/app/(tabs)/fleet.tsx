import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { baseRental } from '@motor-rent/shared';

import { ArrowRightIcon } from '@/components/icons';
import { bikeCredit, bikeSource, type VehicleKind } from '@/components/photo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Fonts, Spacing, TopNavInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { money } from '@/lib/format';
import { supabase } from '@/lib/supabase';

type Bike = {
  id: string; kind: VehicleKind; photos: string[]; make: string; model: string; engine_cc: number | null;
  price_plans: { hourly: number; daily: number; weekly: number; deposit: number; multiplier: number; currency: 'MVR' | 'USD' } | null;
};
type Model = { key: string; make: string; model: string; kind: VehicleKind; cc: number | null; count: number; daily: number | null; currency: 'MVR' | 'USD'; first: Bike };

/** Motion curves: a long ease-out for entrances and hovers, an ease-in-out for the drawn rule. */
const EASE = Easing.bezier(0.22, 1, 0.36, 1);
const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
const web = Platform.OS === 'web';
/** CSS transition on web (hover states); nothing on native. */
const tr = (prop: string, ms: number) =>
  (web ? { transitionProperty: prop, transitionDuration: `${ms}ms`, transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' } : {}) as ViewStyle;

/** Each model in the fleet shown whole, with its day price. Tapping one starts a booking with it. */
export default function FleetScreen() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const cols = width >= 1024 ? 3 : width >= 640 ? 2 : 1;
  const gutter = width >= 640 ? Spacing.five : Spacing.three;
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

  const titleSize = Math.min(96, Math.max(44, width * 0.076));
  const colWidth = `${(100 - (cols - 1) * 2.2) / cols}%` as `${number}%`;

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={[styles.body, { paddingHorizontal: gutter }]}>
        <Reveal delay={0} duration={800}>
          <ThemedText accessibilityRole="header"
            style={[styles.title, { fontSize: titleSize, lineHeight: titleSize * 1.02, letterSpacing: -titleSize * 0.035, color: t.text }]}>
            Pick your bike.
          </ThemedText>
        </Reveal>
        <DrawnRule color={t.accent} />
        <Reveal delay={450} duration={900}>
          <ThemedText themeColor="textSecondary" style={[styles.lead, { fontSize: width >= 640 ? 20 : 18 }]}>
            Scooters and motorbikes by the hour or the day, from our counter in Kulhudhuffushi. Helmets on request.
          </ThemedText>
        </Reveal>

        {!models ? <ActivityIndicator color={t.accent} style={{ marginVertical: Spacing.six }} /> : (
          <View style={[styles.grid, { columnGap: cols > 1 ? '2.2%' : 0 } as ViewStyle]}>
            {models.map((m, i) => (
              <Reveal key={m.key} delay={80 * (i + 1)} duration={800} style={{ width: cols === 1 ? '100%' : colWidth }}>
                <ModelCard m={m} />
              </Reveal>
            ))}
          </View>
        )}
        {models && models.length > 0 && (
          <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.three }}>
            Colours and plates depend on which bike is free for your times.
          </ThemedText>
        )}
        {models && [...new Set(models.map((m) => bikeCredit(m.first)).filter(Boolean))].map((c) => (
          <ThemedText key={c} type="small" themeColor="textSecondary" style={{ fontSize: 11, lineHeight: 15, opacity: 0.8 }}>{c}</ThemedText>
        ))}

        <AnyBike wide={width >= 760} />
      </ScrollView>
    </ThemedView>
  );
}

/** Fades in and rises 12 px (once, on mount). */
function Reveal({ delay, duration, children, style }: { delay: number; duration: number; children: ReactNode; style?: ViewStyle }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => { if (!reduce) p.value = withDelay(delay, withTiming(1, { duration, easing: EASE })); }, [reduce, delay, duration, p]);
  const a = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 12 }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/** Short red rule under the title that draws itself in from the left. */
function DrawnRule({ color }: { color: string }) {
  const reduce = useReducedMotion();
  const s = useSharedValue(reduce ? 1 : 0);
  useEffect(() => { if (!reduce) s.value = withDelay(350, withTiming(1, { duration: 1100, easing: EASE_IN_OUT })); }, [reduce, s]);
  const a = useAnimatedStyle(() => ({ transform: [{ scaleX: s.value }] }));
  return <Animated.View style={[styles.rule, redLine(color), { transformOrigin: 'left' } as ViewStyle, a]} />;
}

/** A 3 px red line that fades towards its end (solid on native). */
const redLine = (color: string): ViewStyle =>
  (web ? { backgroundImage: `linear-gradient(90deg, ${color}, ${color}99)` } : { backgroundColor: color }) as ViewStyle;

function ModelCard({ m }: { m: Model }) {
  const t = useTheme();
  const [hover, setHover] = useState(false);
  const [stageW, setStageW] = useState(0);
  const { source, cutout } = bikeSource(m.first);
  const word = m.model.split(/\s+/)[0]!.toUpperCase();
  const book = () => router.push({ pathname: '/book', params: { bike: m.first.id } });
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
        {cutout ? (
          <>
            {stageW > 0 && (
              <View pointerEvents="none" style={[styles.wordBox, { transform: [{ translateX: hover ? stageW * 0.02 : 0 }] }, tr('transform', 700)]}>
                <ThemedText aria-hidden numberOfLines={1}
                  style={[styles.word, { fontSize: wordSize, lineHeight: wordSize, letterSpacing: -wordSize * 0.05 },
                    web ? ({ color: 'transparent', WebkitTextStroke: `1.5px ${ink}2E`, whiteSpace: 'nowrap' } as object) : { color: ink + '14' }]}>
                  {word}
                </ThemedText>
              </View>
            )}
            <View style={[styles.shot, { transform: [{ translateX: hover ? -stageW * 0.025 : 0 }, { scale: hover ? 1.03 : 1 }] }, tr('transform', 700)]}>
              <Image source={source} style={StyleSheet.absoluteFill} contentFit="contain" contentPosition="bottom" transition={300} />
            </View>
            <View style={[styles.line, redLine(t.accent)]} />
          </>
        ) : (
          <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
            <View style={[StyleSheet.absoluteFill, { transform: [{ scale: hover ? 1.03 : 1 }] }, tr('transform', 700)]}>
              <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
            </View>
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        <ThemedText style={[styles.kicker, { color: t.accent }]}>{m.cc ? `${m.cc} cc ` : ''}{m.kind}</ThemedText>
        <ThemedText style={[styles.name, { color: t.text }]}>{m.make} {m.model}</ThemedText>
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

/** Red panel: book whichever bike is free. */
function AnyBike({ wide }: { wide: boolean }) {
  const t = useTheme();
  const [hover, setHover] = useState(false);
  return (
    <View style={[styles.cta, { backgroundColor: t.accent, padding: wide ? Spacing.six : Spacing.four }, wide && styles.ctaWide]}>
      <View style={[styles.ring, { width: 320, height: 320, top: -112, right: -112, borderColor: 'rgba(255,255,255,0.2)' }]} />
      <View style={[styles.ring, { width: 480, height: 480, top: -176, right: -176, borderColor: 'rgba(255,255,255,0.12)' }]} />
      <View style={[{ gap: Spacing.one }, wide && { flexShrink: 1 }]}>
        <ThemedText style={[styles.ctaTitle, { color: t.accentText, fontSize: wide ? 44 : 34, lineHeight: wide ? 48 : 38 }]}>Any bike</ThemedText>
        <ThemedText style={{ color: 'rgba(255,255,255,0.88)', fontSize: wide ? 20 : 17, lineHeight: wide ? 28 : 24 }}>Pick your times and we show every bike that’s free.</ThemedText>
      </View>
      <Pressable onPress={() => router.push('/book')} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} accessibilityRole="link"
        style={[styles.ctaBtn, { transform: [{ translateY: hover ? -2 : 0 }] }, web && ({ boxShadow: hover ? '0 16px 34px -12px rgba(0,0,0,0.35)' : 'none' } as ViewStyle), tr('transform, box-shadow', 350)]}>
        <ThemedText style={[styles.ctaBtnText, { color: t.accent }]}>Book now</ThemedText>
        <View style={[{ transform: [{ translateX: hover ? 4 : 0 }] }, tr('transform', 350)]}><ArrowRightIcon size={20} color={t.accent} /></View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingTop: TopNavInset + Spacing.five, paddingBottom: BottomTabInset + Spacing.six, maxWidth: 1296, width: '100%', alignSelf: 'center' },
  title: { fontFamily: Fonts?.display, fontWeight: '800', maxWidth: 1100 },
  rule: { width: 128, height: 3, borderRadius: 999, marginTop: Spacing.four },
  lead: { marginTop: Spacing.four, maxWidth: 640, lineHeight: 30 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.four, marginTop: Spacing.six },
  card: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  stage: { aspectRatio: 5 / 4, width: '100%', overflow: 'hidden' },
  wordBox: { position: 'absolute', top: '13%', left: '-50%', right: '-50%', alignItems: 'center' },
  word: { textAlign: 'center', fontFamily: Fonts?.display, fontWeight: '800' },
  shot: { position: 'absolute', top: '16%', left: '8%', right: '8%', bottom: '3.5%' },
  line: { position: 'absolute', left: '8%', right: '8%', bottom: '7%', height: 3, borderRadius: 999 },
  cardBody: { paddingTop: Spacing.two, paddingHorizontal: Spacing.four, paddingBottom: Spacing.four, gap: 12, flexGrow: 1 },
  kicker: { fontSize: 13, lineHeight: 20, fontWeight: '600', letterSpacing: 13 * 0.18, textTransform: 'uppercase' },
  name: { fontFamily: Fonts?.display, fontSize: 26, lineHeight: 29, fontWeight: '800', letterSpacing: -0.8 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three, borderTopWidth: 1, paddingTop: 14, marginTop: 'auto' },
  price: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', flexShrink: 1 },
  muted: { fontSize: 14, lineHeight: 20 },
  fare: { fontFamily: Fonts?.display, fontSize: 26, lineHeight: 30, fontWeight: '800', letterSpacing: -0.8, marginHorizontal: 6 },
  go: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cta: { borderRadius: 16, overflow: 'hidden', gap: Spacing.four, marginTop: Spacing.six },
  ctaWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ring: { position: 'absolute', borderWidth: 1, borderRadius: 999 },
  ctaTitle: { fontFamily: Fonts?.display, fontWeight: '800', letterSpacing: -1.2 },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, alignSelf: 'flex-start', backgroundColor: '#FFFFFF', minHeight: 52, paddingHorizontal: Spacing.four, borderRadius: 8 },
  ctaBtnText: { fontSize: 17, fontWeight: '600' },
});

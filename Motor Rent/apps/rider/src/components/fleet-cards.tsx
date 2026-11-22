import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { baseRental } from '@motor-rent/shared';

import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { money } from '@/lib/format';
import { supabase } from '@/lib/supabase';

import { ArrowRightIcon } from './icons';
import { redLine, Reveal, tr, web } from './page-kit';
import { bikeSource, type VehicleKind } from './photo';
import { ThemedText } from './themed-text';

export type Plan = { hourly: number; daily: number; weekly: number; deposit: number; multiplier: number; currency: 'MVR' | 'USD' };
export type Bike = {
  id: string; kind: VehicleKind; photos: string[]; make: string; model: string; engine_cc: number | null;
  price_plans: Plan | null;
};
export type Model = {
  key: string; make: string; model: string; kind: VehicleKind; cc: number | null; count: number;
  daily: number | null; currency: 'MVR' | 'USD'; plan: Plan | null; first: Bike;
};

/** Price of `hours` on a plan, with its seasonal multiplier. */
export const planPrice = (plan: Plan, hours: number) => Math.round(baseRental(hours, plan) * (Number(plan.multiplier) || 1));

/** Active bikes grouped by make and model, each with its cheapest day price. */
export function useModels() {
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
          const daily = p ? planPrice(p, 24) : null;
          const g = groups.get(key);
          if (!g) groups.set(key, { key, make: b.make, model: b.model, kind: b.kind, cc: b.engine_cc, count: 1, daily, currency: p?.currency ?? 'MVR', plan: p, first: b });
          else {
            g.count += 1;
            if (daily != null && (g.daily == null || daily < g.daily)) { g.daily = daily; g.plan = p; }
            if (!g.first.photos?.length && b.photos?.length) g.first = b;
          }
        }
        setModels([...groups.values()]);
      });
  }, []);
  return models;
}

/** The fleet as a grid of showroom cards: 1, 2 or 3 columns by width. */
export function ModelGrid({ models, onView = false, style }: { models: Model[]; onView?: boolean; style?: ViewStyle }) {
  const { width } = useWindowDimensions();
  const cols = width >= 1024 ? 3 : width >= 640 ? 2 : 1;
  const colWidth = `${(100 - (cols - 1) * 2.2) / cols}%` as `${number}%`;
  return (
    <View style={[styles.grid, { columnGap: cols > 1 ? '2.2%' : 0 } as ViewStyle, style]}>
      {models.map((m, i) => (
        <Reveal key={m.key} onView={onView} delay={80 * (i + 1)} duration={800} style={{ width: cols === 1 ? '100%' : colWidth }}>
          <ModelCard m={m} />
        </Reveal>
      ))}
    </View>
  );
}

export function ModelCard({ m }: { m: Model }) {
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

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.four },
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
});

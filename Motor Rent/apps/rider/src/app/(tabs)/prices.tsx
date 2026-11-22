import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { planPrice, useModels, type Model } from '@/components/fleet-cards';
import { ArrowRightIcon, ClockIcon, MinusIcon, PlusIcon, ShieldIcon } from '@/components/icons';
import { EASE, Page, PageHead, Panel, pageStyles, Reveal, tr, web } from '@/components/page-kit';
import { bikeSource } from '@/components/photo';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { money } from '@/lib/format';
import { supabase } from '@/lib/supabase';

type Extra = { code: string; label: string; per_day: number };
const HOURS = [1, 2, 3, 4];

/** What renting costs: day prices per model, a calculator, hourly prices, extras and how time is counted. */
export default function PricesScreen() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const models = useModels();
  const priced = (models ?? []).filter((m) => m.plan);
  const [extras, setExtras] = useState<Extra[]>([]);
  useEffect(() => {
    supabase.from('extras').select('code, label, per_day').eq('active', true).eq('code', 'helmet')
      .then(({ data }) => setExtras((data ?? []) as Extra[]));
  }, []);

  return (
    <Page>
      <PageHead title="What it costs." lead="One price per day or per hour, shown in full before you book. A helmet and other extras are only added if you ask." />
      {!models ? <ActivityIndicator color={t.accent} style={{ marginVertical: Spacing.six }} /> : (
        <View style={[styles.cols, wide && styles.colsWide]}>
          <View style={[styles.col, wide && { flex: 1.1 }]}>
            <Reveal delay={120}>
              <Panel>
                <ThemedText style={[pageStyles.display, styles.h2, { color: t.text }]}>By the day</ThemedText>
                {priced.map((m, i) => <DayRow key={m.key} m={m} first={i === 0} />)}
                {!priced.length && <ThemedText themeColor="textSecondary">Prices appear here once bikes are listed.</ThemedText>}
              </Panel>
            </Reveal>
            {priced.length > 0 && (
              <Reveal delay={200}>
                <Panel>
                  <ThemedText style={[pageStyles.display, styles.h2, { color: t.text }]}>By the hour</ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.note}>From one hour. Every started hour counts.</ThemedText>
                  <View style={styles.hourGrid}>
                    {HOURS.map((h) => (
                      <View key={h} style={[styles.hourTile, { borderColor: t.border, backgroundColor: t.background }]}>
                        <ThemedText themeColor="textSecondary" style={{ fontSize: 14 }}>{h} {h === 1 ? 'hour' : 'hours'}</ThemedText>
                        <ThemedText style={[pageStyles.display, { fontSize: 19, lineHeight: 24, color: t.text }]}>
                          {money(Math.min(...priced.map((m) => planPrice(m.plan!, h))), priced[0]!.currency)}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                  {priced.length > 1 && <ThemedText themeColor="textSecondary" style={styles.note}>For our lowest-priced bike; bigger bikes cost a little more.</ThemedText>}
                </Panel>
              </Reveal>
            )}
          </View>
          <View style={[styles.col, wide && { flex: 1 }]}>
            {priced.length > 0 && (
              <Reveal delay={160}>
                <Calculator models={priced} />
              </Reveal>
            )}
            <Reveal delay={240}>
              <Panel tone="soft" style={{ gap: Spacing.four }}>
                {extras.map((e) => (
                  <Fact key={e.code} icon={<PlusIcon size={18} color={t.accent} />} title={e.label}
                    body={`${money(e.per_day)} a day, only if you add it when you book.`} />
                ))}
                <Fact icon={<ClockIcon size={20} color={t.accent} />} title="How time is counted"
                  body="A day is 24 hours from pickup. Go a little over and only the extra hours are added, never more than another day's price." />
                <Fact icon={<ShieldIcon size={20} color={t.accent} />} title="Pay to confirm"
                  body="Your bike is held while you pay by bank transfer. Until the payment is confirmed you can cancel at no cost." />
              </Panel>
            </Reveal>
          </View>
        </View>
      )}
    </Page>
  );
}

function DayRow({ m, first }: { m: Model; first: boolean }) {
  const t = useTheme();
  const { source, cutout } = bikeSource(m.first);
  return (
    <View style={[styles.dayRow, !first && { borderTopWidth: 1, borderColor: t.border }]}>
      <View style={[styles.thumb, !cutout && { borderRadius: 10, overflow: 'hidden' }]}>
        <Image source={source} style={StyleSheet.absoluteFill} contentFit={cutout ? 'contain' : 'cover'} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText style={[pageStyles.display, { fontSize: 19, lineHeight: 24, color: t.text }]}>{m.make} {m.model}</ThemedText>
        <ThemedText themeColor="textSecondary" style={{ fontSize: 14 }}>{m.cc ? `${m.cc} cc ` : ''}{m.kind} · {money(m.plan!.hourly, m.currency)} an hour</ThemedText>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <ThemedText style={[pageStyles.display, { fontSize: 22, lineHeight: 26, color: t.text }]}>{money(m.daily!, m.currency)}</ThemedText>
        <ThemedText themeColor="textSecondary" style={{ fontSize: 13 }}>a day</ThemedText>
      </View>
    </View>
  );
}

/** Pick a model, days or hours, and a count; the total updates as you go. */
function Calculator({ models }: { models: Model[] }) {
  const t = useTheme();
  const [key, setKey] = useState(models[0]!.key);
  const [unit, setUnit] = useState<'days' | 'hours'>('days');
  const [n, setN] = useState(3);
  const m = models.find((x) => x.key === key) ?? models[0]!;
  const max = unit === 'days' ? 30 : 23;
  const count = Math.min(n, max);
  const hours = unit === 'days' ? count * 24 : count;
  const total = planPrice(m.plan!, hours);
  const [hover, setHover] = useState(false);

  return (
    <Panel style={[styles.calc, { borderTopColor: t.accent }]}>
      <ThemedText style={[pageStyles.display, styles.h2, { color: t.text }]}>Work out your ride</ThemedText>
      {models.length > 1 && (
        <View style={{ gap: Spacing.two }}>
          <ThemedText type="smallBold" themeColor="textSecondary">Bike</ThemedText>
          <View style={styles.pickRow}>
            {models.map((x) => {
              const on = x.key === key;
              const { source, cutout } = bikeSource(x.first);
              return (
                <Pressable key={x.key} onPress={() => setKey(x.key)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                  style={[styles.pick, { borderColor: on ? t.accent : t.border, borderWidth: on ? 2 : 1, backgroundColor: t.background }, tr('border-color', 200)]}>
                  <View style={{ width: '100%', aspectRatio: 4 / 3 }}>
                    <Image source={source} style={StyleSheet.absoluteFill} contentFit={cutout ? 'contain' : 'cover'} />
                  </View>
                  <ThemedText type="smallBold" numberOfLines={1}>{x.model}</ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
      <Segmented value={unit} onChange={(u) => { setUnit(u); setN(u === 'days' ? 3 : 2); }} />
      <View style={styles.stepRow}>
        <Step label="Fewer" disabled={count <= 1} onPress={() => setN(Math.max(1, count - 1))}><MinusIcon color={t.text} /></Step>
        <ThemedText style={[pageStyles.display, { fontSize: 24, minWidth: 44, textAlign: 'center', color: t.text }]} accessibilityLiveRegion="polite">{count}</ThemedText>
        <Step label="More" disabled={count >= max} onPress={() => setN(Math.min(max, count + 1))}><PlusIcon color={t.text} /></Step>
        <ThemedText themeColor="textSecondary" style={{ fontSize: 16 }}>{unit === 'days' ? (count === 1 ? 'day' : 'days') : (count === 1 ? 'hour' : 'hours')}</ThemedText>
      </View>
      <View style={[styles.totalRow, { borderColor: t.border }]}>
        <ThemedText themeColor="textSecondary" style={{ fontSize: 15 }}>Total</ThemedText>
        <ThemedText style={[pageStyles.display, { fontSize: 40, lineHeight: 44, letterSpacing: -1.2, color: t.text }]}>{money(total, m.currency)}</ThemedText>
      </View>
      <Pressable onPress={() => router.push({ pathname: '/book', params: { bike: m.first.id } })} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
        accessibilityRole="link"
        style={[styles.bookBtn, { backgroundColor: hover ? t.accentStrong : t.accent }, web && ({ boxShadow: `0 14px 30px -14px ${t.accent}` } as ViewStyle), tr('background-color', 200)]}>
        <ThemedText style={{ color: t.accentText, fontSize: 17, fontWeight: '600' }}>Book the {m.model}</ThemedText>
        <View style={[{ transform: [{ translateX: hover ? 4 : 0 }] }, tr('transform', 350)]}><ArrowRightIcon color={t.accentText} /></View>
      </Pressable>
      <ThemedText themeColor="textSecondary" style={[styles.note, { textAlign: 'center' }]}>You choose the exact times when you book.</ThemedText>
    </Panel>
  );
}

/** Two-way switch with a sliding thumb. */
function Segmented({ value, onChange }: { value: 'days' | 'hours'; onChange: (v: 'days' | 'hours') => void }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const x = useSharedValue(value === 'days' ? 0 : 1);
  useEffect(() => { x.value = withTiming(value === 'days' ? 0 : 1, { duration: 300, easing: EASE }); }, [value, x]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * (w / 2) }] }));
  return (
    <View style={[styles.seg, { borderColor: t.border, backgroundColor: t.background }]} onLayout={(e) => setW(e.nativeEvent.layout.width - 8)} accessibilityRole="radiogroup">
      {w > 0 && <Animated.View style={[styles.segThumb, { width: w / 2, backgroundColor: t.text }, thumb]} />}
      {(['days', 'hours'] as const).map((v) => (
        <Pressable key={v} onPress={() => onChange(v)} style={styles.segOpt} accessibilityRole="radio" accessibilityState={{ checked: value === v }}>
          <ThemedText type="smallBold" style={{ color: value === v ? t.background : t.textSecondary }}>{v === 'days' ? 'By the day' : 'By the hour'}</ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

function Step({ label, disabled, onPress, children }: { label: string; disabled: boolean; onPress: () => void; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [styles.step, { borderColor: t.border, backgroundColor: t.background }, disabled && { opacity: 0.35 }, pressed && { transform: [{ scale: 0.94 }] }]}>
      {children}
    </Pressable>
  );
}

function Fact({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  const t = useTheme();
  return (
    <View style={styles.fact}>
      <View style={[styles.factIcon, { backgroundColor: t.accentSoft }]}>{icon}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText style={[pageStyles.display, { fontSize: 19, lineHeight: 24, color: t.text }]}>{title}</ThemedText>
        <ThemedText themeColor="textSecondary" style={{ fontSize: 16, lineHeight: 24 }}>{body}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cols: { marginTop: Spacing.six, gap: Spacing.three },
  colsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { gap: Spacing.three },
  h2: { fontSize: 26, lineHeight: 30, letterSpacing: -0.8, marginBottom: Spacing.two },
  note: { fontSize: 14, lineHeight: 20 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  thumb: { width: 72, height: 54 },
  hourGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginVertical: Spacing.two },
  hourTile: { flexGrow: 1, flexBasis: '22%', minWidth: 120, borderWidth: 1, borderRadius: 10, paddingVertical: Spacing.three, alignItems: 'center', gap: 2 },
  calc: { gap: Spacing.three, borderTopWidth: 3 },
  pickRow: { flexDirection: 'row', gap: Spacing.two },
  pick: { flex: 1, borderRadius: 10, padding: Spacing.two, alignItems: 'center', gap: Spacing.one },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 4, alignSelf: 'flex-start', minWidth: 280 },
  segThumb: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: 7 },
  segOpt: { flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: Spacing.three },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  step: { width: 48, height: 48, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  totalRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: Spacing.three },
  bookBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 54, borderRadius: 8 },
  fact: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  factIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});

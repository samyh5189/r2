import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming,
} from 'react-native-reanimated';

import { BottomTabInset, Fonts, Spacing, TopNavInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSiteSettings } from '@/lib/site';

import { BrandMark } from './brand';
import { ArrowRightIcon, ChevronDownIcon } from './icons';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

/** Motion curves shared by every page: a long ease-out, and an ease-in-out for drawn lines. */
export const EASE = Easing.bezier(0.22, 1, 0.36, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
export const web = Platform.OS === 'web';
/** CSS transition on web (hover states); nothing on native. */
export const tr = (prop: string, ms: number) =>
  (web ? { transitionProperty: prop, transitionDuration: `${ms}ms`, transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' } : {}) as ViewStyle;
/** A 3 px red line that fades towards its end (solid on native). */
export const redLine = (color: string): ViewStyle =>
  (web ? { backgroundImage: `linear-gradient(90deg, ${color}, ${color}99)` } : { backgroundColor: color }) as ViewStyle;

/** Counter opening hours (Maldives time, every day), as in the rental terms. */
export const OPENING = { open: 7, close: 22, label: '07:00 – 22:00' };
export function isOpenNow(now = new Date()) {
  const h = (now.getUTCHours() + 5) % 24 + now.getUTCMinutes() / 60;
  return h >= OPENING.open && h < OPENING.close;
}
export const whatsappUrl = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '').replace(/^(\d{7})$/, '960$1')}`;

/** True once the element has scrolled into view (web). Native shows content straight away. */
function useInView(enabled: boolean) {
  const ref = useRef<unknown>(null);
  const [seen, setSeen] = useState(!enabled || !web || typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (seen) return;
    const node = ref.current as unknown as Element | null;
    if (!node) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    io.observe(node);
    return () => io.disconnect();
  }, [seen]);
  return { ref, seen };
}

/** Fades in and rises 12 px, on mount or (with `onView`) when scrolled into view. */
export function Reveal({ delay = 0, duration = 800, rise = 12, onView = false, children, style }: {
  delay?: number; duration?: number; rise?: number; onView?: boolean; children: ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReducedMotion();
  const { ref, seen } = useInView(onView && !reduce);
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => { if (!reduce && seen) p.value = withDelay(delay, withTiming(1, { duration, easing: EASE })); }, [reduce, seen, delay, duration, p]);
  const a = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * rise }] }));
  return <Animated.View ref={ref as never} style={[style, a]}>{children}</Animated.View>;
}

/** One word of a title, rising 0.55 em as it fades in. */
function Word({ word, delay, duration, size, style }: { word: string; delay: number; duration: number; size: number; style: StyleProp<TextStyle> }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => { if (!reduce) p.value = withDelay(delay, withTiming(1, { duration, easing: EASE })); }, [reduce, delay, duration, p]);
  const a = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * size * 0.55 }] }));
  return <Animated.View style={a}><ThemedText style={style}>{word}</ThemedText></Animated.View>;
}

/** A big title that comes in word by word. */
export function RiseTitle({ text, size, color, start = 60, step = 70, duration = 900, style }: {
  text: string; size: number; color?: string; start?: number; step?: number; duration?: number; style?: StyleProp<TextStyle>;
}) {
  const t = useTheme();
  const words = text.split(' ');
  const ts: StyleProp<TextStyle> = [styles.title, { fontSize: size, lineHeight: size * 1.04, letterSpacing: -size * 0.035, color: color ?? t.text }, style];
  return (
    <View style={[styles.words, { columnGap: size * 0.24 }]} accessible accessibilityRole="header" accessibilityLabel={text}>
      {words.map((w, i) => <Word key={i} word={w} delay={start + i * step} duration={duration} size={size} style={ts} />)}
    </View>
  );
}

/** Short red rule that draws itself in from the left. */
export function DrawnRule({ color, delay = 350, width = 128, onView = false, style }: { color?: string; delay?: number; width?: number; onView?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const { ref, seen } = useInView(onView && !reduce);
  const s = useSharedValue(reduce ? 1 : 0);
  useEffect(() => { if (!reduce && seen) s.value = withDelay(delay, withTiming(1, { duration: 1100, easing: EASE_IN_OUT })); }, [reduce, seen, delay, s]);
  const a = useAnimatedStyle(() => ({ transform: [{ scaleX: s.value }] }));
  return <Animated.View ref={ref as never} style={[styles.rule, { width }, redLine(color ?? t.accent), { transformOrigin: 'left' } as ViewStyle, style, a]} />;
}

/** Title size used by inner pages: grows with the window. */
export const usePageTitleSize = () => {
  const { width } = useWindowDimensions();
  return Math.min(96, Math.max(44, width * 0.076));
};

/** Kicker, rising title, drawn rule and lead: how every inner page opens. */
export function PageHead({ kicker, title, lead }: { kicker?: string; title: string; lead?: string }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const size = usePageTitleSize();
  return (
    <View>
      {kicker && (
        <Reveal duration={900} rise={8}>
          <ThemedText style={[styles.kicker, { color: t.accent, marginBottom: Spacing.three }]}>{kicker}</ThemedText>
        </Reveal>
      )}
      <RiseTitle text={title} size={size} />
      <DrawnRule style={{ marginTop: Spacing.four }} />
      {lead && (
        <Reveal delay={450} duration={900}>
          <ThemedText themeColor="textSecondary" style={[styles.lead, { fontSize: width >= 640 ? 20 : 18 }]}>{lead}</ThemedText>
        </Reveal>
      )}
    </View>
  );
}

/** A section heading that reveals as it scrolls into view. */
export function SectionTitle({ title, kicker, sub }: { title: string; kicker?: string; sub?: string }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const size = width >= 640 ? 44 : 34;
  return (
    <Reveal onView style={{ gap: Spacing.two }}>
      {kicker && <ThemedText style={[styles.kicker, { color: t.accent }]}>{kicker}</ThemedText>}
      <ThemedText accessibilityRole="header" style={[styles.title, { fontSize: size, lineHeight: size * 1.08, letterSpacing: -size * 0.03, color: t.text }]}>{title}</ThemedText>
      {sub && <ThemedText themeColor="textSecondary" style={{ fontSize: 17, lineHeight: 26, maxWidth: 560 }}>{sub}</ThemedText>}
    </Reveal>
  );
}

/** Page shell for inner pages: scrolls under the floating header, ends with the footer. */
export function Page({ children, cta = true }: { children: ReactNode; cta?: boolean }) {
  const { width } = useWindowDimensions();
  const gutter = width >= 640 ? Spacing.five : Spacing.three;
  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.body, { paddingHorizontal: gutter }]}>
          {children}
          {cta && <ReadyToRide />}
        </View>
        <SiteFooter />
      </ScrollView>
    </ThemedView>
  );
}

/** A white-edged card used for page sections. */
export function Panel({ children, style, tone = 'card' }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'card' | 'soft' }) {
  const t = useTheme();
  return (
    <View style={[styles.panel, tone === 'card'
      ? [{ backgroundColor: t.backgroundElement, borderColor: t.border, borderWidth: 1 }, web && ({ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.65), 0 26px 60px -46px rgba(17,16,20,0.4)' } as ViewStyle)]
      : { backgroundColor: t.backgroundSelected }, style]}>
      {children}
    </View>
  );
}

/** One expanding ring on the red panel: grows from 35 % to 150 % while it fades, on a 9 s loop. */
function Ripple({ delay }: { delay: number }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? 0.4 : 0);
  useEffect(() => {
    if (!reduce) p.value = withDelay(delay, withRepeat(withTiming(1, { duration: 9000, easing: Easing.linear }), -1, false));
  }, [reduce, delay, p]);
  const a = useAnimatedStyle(() => ({ opacity: 0.9 * (1 - p.value), transform: [{ scale: 0.35 + 1.15 * p.value }] }));
  return <Animated.View pointerEvents="none" style={[styles.ripple, a]} />;
}

/** Red closing panel on every page: book a ride. */
export function ReadyToRide({ title = 'Ready when you are.', body = 'Pick your times and we show every bike that’s free, with the full price.' }: { title?: string; body?: string }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const [hover, setHover] = useState(false);
  return (
    <Reveal onView style={{ marginTop: Spacing.six }}>
      <View style={[styles.cta, { backgroundColor: t.accent, padding: wide ? Spacing.six : Spacing.four }, wide && styles.ctaWide]}>
        <Ripple delay={0} /><Ripple delay={3000} /><Ripple delay={6000} />
        <View style={[{ gap: Spacing.one }, wide && { flexShrink: 1 }]}>
          <ThemedText style={[styles.title, { color: t.accentText, fontSize: wide ? 44 : 34, lineHeight: wide ? 48 : 38, letterSpacing: -1.2 }]}>{title}</ThemedText>
          <ThemedText style={{ color: 'rgba(255,255,255,0.88)', fontSize: wide ? 20 : 17, lineHeight: wide ? 28 : 24, maxWidth: 520 }}>{body}</ThemedText>
        </View>
        <Pressable onPress={() => router.push('/book')} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} accessibilityRole="link"
          style={[styles.ctaBtn, { transform: [{ translateY: hover ? -2 : 0 }] }, web && ({ boxShadow: hover ? '0 16px 34px -12px rgba(0,0,0,0.35)' : 'none' } as ViewStyle), tr('transform, box-shadow', 350)]}>
          <ThemedText style={[styles.ctaBtnText, { color: t.accent }]}>Book a ride</ThemedText>
          <View style={[{ transform: [{ translateX: hover ? 4 : 0 }] }, tr('transform', 350)]}><ArrowRightIcon size={20} color={t.accent} /></View>
        </Pressable>
      </View>
    </Reveal>
  );
}

/** Text link with an arrow that nudges right on hover. */
export function ArrowLink({ label, href, onPress, color }: { label: string; href?: Href; onPress?: () => void; color?: string }) {
  const t = useTheme();
  const [hover, setHover] = useState(false);
  return (
    <Pressable onPress={onPress ?? (() => href && router.push(href))} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
      accessibilityRole="link" style={styles.arrowLink}>
      <ThemedText style={{ fontSize: 16, fontWeight: '600', color: color ?? t.text }}>{label}</ThemedText>
      <View style={[{ transform: [{ translateX: hover ? 4 : 0 }] }, tr('transform', 350)]}><ArrowRightIcon size={16} color={t.accent} /></View>
    </Pressable>
  );
}

/** A question that opens to show its answer (height eases over 200 ms). */
export function Question({ q, a, first, defaultOpen = false }: { q: string; a: string; first?: boolean; defaultOpen?: boolean }) {
  const t = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const [h, setH] = useState(0);
  const p = useSharedValue(defaultOpen ? 1 : 0);
  useEffect(() => { p.value = withTiming(open ? 1 : 0, { duration: 200, easing: Easing.bezier(0, 0, 0.2, 1) }); }, [open, p]);
  const body = useAnimatedStyle(() => ({ height: h * p.value }));
  const chev = useAnimatedStyle(() => ({ transform: [{ rotate: `${p.value * 180}deg` }] }));
  return (
    <View style={[!first && { borderTopWidth: 1, borderColor: t.border }]}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.qRow, pressed && { opacity: 0.7 }, hovered && { opacity: 0.8 }]}>
        <ThemedText style={[styles.q, { color: t.text }]}>{q}</ThemedText>
        <Animated.View style={chev}><ChevronDownIcon color={t.text} /></Animated.View>
      </Pressable>
      <Animated.View style={[{ overflow: 'hidden' }, body]} aria-hidden={!open}>
        <View style={styles.aBox} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
          <ThemedText themeColor="textSecondary" style={styles.a}>{a}</ThemedText>
        </View>
      </Animated.View>
    </View>
  );
}

/** Green dot that pulses while the counter is open. */
export function OpenNow({ light = false }: { light?: boolean }) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const [open] = useState(isOpenNow);
  const p = useSharedValue(0);
  useEffect(() => {
    if (open && !reduce) p.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.bezier(0, 0, 0.58, 1) }), -1, false);
  }, [open, reduce, p]);
  const halo = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - p.value), transform: [{ scale: 1 + p.value * 1.6 }] }));
  const dot = open ? (light ? '#86EFAC' : '#16A34A') : light ? 'rgba(255,255,255,0.55)' : t.textSecondary;
  return (
    <View style={styles.openRow}>
      <View style={[styles.dot, { backgroundColor: dot }]}>
        {open && <Animated.View style={[StyleSheet.absoluteFill, styles.dotHalo, { backgroundColor: dot }, halo]} />}
      </View>
      <ThemedText style={{ fontSize: 15, fontWeight: '600', color: light ? 'rgba(255,255,255,0.92)' : t.textSecondary }}>
        {open ? `Open now · until ${String(OPENING.close).padStart(2, '0')}:00` : `Closed now · opens ${String(OPENING.open).padStart(2, '0')}:00`}
      </ThemedText>
    </View>
  );
}

const FOOT: { title: string; links: { label: string; href: Href }[] }[] = [
  { title: 'Explore', links: [{ label: 'Fleet', href: '/fleet' }, { label: 'Prices', href: '/prices' }, { label: 'Our counter', href: '/counter' }, { label: 'Book a ride', href: '/book' }] },
  { title: 'Help', links: [{ label: 'Questions', href: '/help' }, { label: 'Rental terms', href: '/terms' }, { label: 'Privacy', href: '/privacy' }, { label: 'My account', href: '/account' }] },
];

/** Site footer: brand, links, opening hours and where to find us. */
export function SiteFooter() {
  const t = useTheme();
  const site = useSiteSettings();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const gutter = width >= 640 ? Spacing.five : Spacing.three;
  const phone = site?.support_phone;
  return (
    <View style={[styles.footer, { borderColor: t.border, backgroundColor: t.backgroundElement }]}>
      <View style={[styles.footInner, { paddingHorizontal: gutter }, wide && { flexDirection: 'row', gap: Spacing.six }]}>
        <View style={[{ gap: Spacing.three }, wide && { flex: 1.4 }]}>
          <View style={styles.footBrand}>
            <BrandMark size={30} />
            <ThemedText style={[styles.title, { fontSize: 20, lineHeight: 24, color: t.text }]}>Rent a Motor</ThemedText>
          </View>
          <ThemedText themeColor="textSecondary" style={{ fontSize: 15, lineHeight: 22, maxWidth: 340 }}>
            Scooters and motorbikes for rent in Kulhudhuffushi, by the hour or the day.
          </ThemedText>
          <DrawnRule width={72} onView delay={0} />
          {phone && <ArrowLink label={`WhatsApp ${phone}`} onPress={() => Linking.openURL(whatsappUrl(phone))} />}
        </View>
        {FOOT.map((col) => (
          <View key={col.title} style={[styles.footCol, wide && { flex: 1 }]}>
            <ThemedText style={[styles.footHead, { color: t.textSecondary }]}>{col.title}</ThemedText>
            {col.links.map((l) => (
              <Pressable key={l.label} onPress={() => router.push(l.href)} accessibilityRole="link"
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [pressed && { opacity: 0.5 }, hovered && { opacity: 0.65 }]}>
                <ThemedText style={{ fontSize: 15, lineHeight: 26, color: t.text }}>{l.label}</ThemedText>
              </Pressable>
            ))}
          </View>
        ))}
        <View style={[styles.footCol, wide && { flex: 1.2 }]}>
          <ThemedText style={[styles.footHead, { color: t.textSecondary }]}>Opening hours</ThemedText>
          <ThemedText style={{ fontSize: 15, lineHeight: 22, color: t.text }}>Every day{'\n'}{OPENING.label}</ThemedText>
          <ThemedText themeColor="textSecondary" style={{ fontSize: 14, lineHeight: 21, marginTop: Spacing.one }}>Counter in Kulhudhuffushi, Haa Dhaalu Atoll</ThemedText>
        </View>
      </View>
      <View style={[styles.footBase, { borderColor: t.border, paddingHorizontal: gutter }]}>
        <ThemedText themeColor="textSecondary" style={{ fontSize: 13 }}>© {new Date().getFullYear()} Rent a Motor</ThemedText>
      </View>
    </View>
  );
}

export const pageStyles = StyleSheet.create({
  kicker: { fontSize: 13, lineHeight: 20, fontWeight: '600', letterSpacing: 13 * 0.18, textTransform: 'uppercase' },
  display: { fontFamily: Fonts?.display, fontWeight: '800' },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingTop: TopNavInset + Spacing.five, flexGrow: 1 },
  body: { maxWidth: 1296, width: '100%', alignSelf: 'center', paddingBottom: Spacing.six },
  words: { flexDirection: 'row', flexWrap: 'wrap', maxWidth: 1100 },
  title: { fontFamily: Fonts?.display, fontWeight: '800' },
  rule: { height: 3, borderRadius: 999 },
  lead: { marginTop: Spacing.four, maxWidth: 640, lineHeight: 30 },
  kicker: pageStyles.kicker,
  panel: { borderRadius: 16, padding: Spacing.four },
  cta: { borderRadius: 16, overflow: 'hidden', gap: Spacing.four },
  ctaWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ripple: { position: 'absolute', top: -128, right: -128, width: 416, height: 416, borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)' },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, alignSelf: 'flex-start', backgroundColor: '#FFFFFF', minHeight: 52, paddingHorizontal: Spacing.four, borderRadius: 8 },
  ctaBtnText: { fontSize: 17, fontWeight: '600' },
  arrowLink: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 6 },
  qRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three, paddingVertical: 18 },
  q: { fontSize: 17, lineHeight: 24, fontWeight: '600', flexShrink: 1 },
  aBox: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: 18 },
  a: { fontSize: 16, lineHeight: 25, maxWidth: 680 },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 24 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotHalo: { borderRadius: 4 },
  footer: { borderTopWidth: 1, marginTop: 'auto', paddingBottom: BottomTabInset },
  footInner: { maxWidth: 1296, width: '100%', alignSelf: 'center', paddingTop: Spacing.six, paddingBottom: Spacing.five, gap: Spacing.five },
  footBrand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  footCol: { gap: 4 },
  footHead: { fontSize: 12, lineHeight: 18, fontWeight: '600', letterSpacing: 12 * 0.16, textTransform: 'uppercase', marginBottom: Spacing.one },
  footBase: { borderTopWidth: 1, paddingVertical: Spacing.three, maxWidth: 1296, width: '100%', alignSelf: 'center' },
});

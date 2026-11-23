import { router, usePathname, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSiteSettings } from '@/lib/site';

import { BrandMark } from './brand';
import { ArrowLeftIcon, CloseIcon, MenuIcon, UserIcon } from './icons';
import { ThemedText } from './themed-text';

/** Drawer and backdrop timing: 200 ms, ease-out on the way in and out. */
const DURATION = 200;
const EASE_OUT = Easing.bezier(0, 0, 0.2, 1);
const WIDE = 900;

type NavLink = { href: Href; label: string };
const LINKS: NavLink[] = [
  { href: '/', label: 'Home' },
  { href: '/fleet', label: 'Fleet' },
  { href: '/prices', label: 'Prices' },
  { href: '/counter', label: 'Our counter' },
  { href: '/help', label: 'Questions' },
  { href: '/book', label: 'Book a ride' },
  { href: '/terms', label: 'Rental terms' },
  { href: '/privacy', label: 'Privacy' },
];
/** Shown inline in the header on wide screens. */
const INLINE: NavLink[] = [
  { href: '/fleet', label: 'Fleet' },
  { href: '/prices', label: 'Prices' },
  { href: '/counter', label: 'Our counter' },
  { href: '/help', label: 'Questions' },
];

const go = (href: Href) => (href === '/' ? router.navigate('/') : router.push(href));

/**
 * The site header: brand, red Book button and a menu button that opens the side drawer.
 * Wide screens show a few links inline instead of the menu button, plus My account.
 * `floating` overlays the page (home, fleet, account); otherwise it sits in the flow with a Back button.
 */
export function SiteHeader({ floating = false, back = false }: { floating?: boolean; back?: boolean }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const wide = width >= WIDE;
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const closeMenu = useCallback(() => setOpen(false), []);

  return (
    <View style={[floating ? styles.floating : styles.inFlow, { paddingTop: insets.top + Spacing.three }, !floating && { backgroundColor: t.background }]}
      pointerEvents="box-none">
      <View style={[styles.bar, { borderColor: t.border, backgroundColor: t.backgroundElement + 'EB' }, Platform.OS === 'web' && ({ backdropFilter: 'blur(14px)' } as object)]}>
        {back && (
          <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel="Back" hitSlop={6}
            style={({ pressed }) => [styles.square, { borderColor: t.border }, pressed && { opacity: 0.7 }]}>
            <ArrowLeftIcon color={t.text} />
          </Pressable>
        )}
        <Pressable onPress={() => router.navigate('/')} accessibilityRole="link" accessibilityLabel="EasyRide home"
          style={({ pressed }) => [styles.brand, pressed && { opacity: 0.7 }]}>
          <BrandMark size={34} />
          {width >= 360 && <ThemedText type="heading" style={styles.brandText}>EasyRide</ThemedText>}
        </Pressable>

        {wide && (
          <View style={styles.inline}>
            {INLINE.map((l) => <InlineLink key={String(l.href)} link={l} active={path === l.href} />)}
          </View>
        )}
        {wide && (
          <Pressable onPress={() => go('/account')} accessibilityRole="link"
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.account, hovered && { backgroundColor: t.backgroundSelected }, pressed && { opacity: 0.75 }]}>
            <UserIcon size={20} color={path.startsWith('/account') ? t.accent : t.text} />
            <ThemedText type="smallBold" style={{ color: path.startsWith('/account') ? t.accent : t.text }}>My account</ThemedText>
          </Pressable>
        )}
        {path !== '/book' && (
          <Pressable onPress={() => router.push('/book')} accessibilityRole="link"
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.book, { backgroundColor: hovered ? t.accentStrong : t.accent }, pressed && { transform: [{ scale: 0.97 }] }]}>
            <ThemedText type="smallBold" style={{ color: t.accentText, fontSize: 15 }}>Book</ThemedText>
          </Pressable>
        )}
        {!wide && (
          <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Open menu" hitSlop={6}
            style={({ pressed }) => [styles.menuBtn, pressed && { opacity: 0.6 }]}>
            <MenuIcon color={t.text} />
          </Pressable>
        )}
      </View>
      <MenuDrawer open={open} onClose={closeMenu} />
    </View>
  );
}

function InlineLink({ link, active }: { link: NavLink; active: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => go(link.href)} accessibilityRole="link"
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.inlineLink, hovered && { backgroundColor: t.backgroundSelected }, pressed && { opacity: 0.75 }]}>
      <ThemedText type="smallBold" style={{ color: active ? t.accent : t.text }}>{link.label}</ThemedText>
    </Pressable>
  );
}

/** Full-height drawer that slides in from the right over a fading backdrop. Full width on phones. */
export function MenuDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTheme();
  const site = useSiteSettings();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const path = usePathname();
  const panelWidth = width >= 640 ? 448 : width;
  const p = useSharedValue(0);
  // Slide in when opened; closing slides out first, then tells the header to unmount the drawer.
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (!closing) {
      if (open) { p.value = 0; p.value = withTiming(1, { duration: DURATION * 2.6, easing: Easing.bezier(0.22, 1, 0.36, 1) }); }
      return;
    }
    // Closing runs the opening in reverse: links fade out, then the panel slides away.
    p.value = withTiming(0, { duration: DURATION * 1.6, easing: Easing.in(Easing.cubic) });
    const id = setTimeout(() => { setClosing(false); onClose(); }, DURATION * 1.6);
    return () => clearTimeout(id);
  }, [open, closing, onClose, p]);
  const close = () => setClosing(true);

  const backdrop = useAnimatedStyle(() => ({ opacity: Math.min(1, p.value / 0.4) }));
  // The panel finishes its slide in the first ~40 % of p; the links stagger in over the rest.
  const panel = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - Math.min(1, p.value / 0.4)) * panelWidth }] }));

  const pick = (href: Href) => { close(); go(href); };
  const phone = site?.support_phone;

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.backgroundElement + 'BF' }, backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close menu" />
      </Animated.View>
      <Animated.View accessibilityViewIsModal role="dialog" aria-label="Menu"
        style={[styles.panel, { width: panelWidth, backgroundColor: t.background, paddingTop: insets.top, paddingBottom: insets.bottom },
          panelWidth < width && [styles.panelRaised, { borderColor: t.border }], panel]}>
        <View style={[styles.panelHead, { borderColor: t.border }]}>
          <Pressable onPress={() => pick('/')} accessibilityRole="link" accessibilityLabel="EasyRide home" style={styles.brand}>
            <BrandMark size={34} />
            <ThemedText type="heading" style={styles.brandText}>EasyRide</ThemedText>
          </Pressable>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close menu" hitSlop={6}
            style={({ pressed }) => [styles.square, { borderColor: t.border, backgroundColor: t.backgroundElement }, pressed && { opacity: 0.7 }]}>
            <CloseIcon color={t.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.panelBody}>
          {LINKS.map((l, i) => (
            <DrawerLink key={String(l.href)} label={l.label} active={path === l.href} onPress={() => pick(l.href)} p={p} index={i} />
          ))}
          {phone && (
            <DrawerLink label="Contact" active={false} p={p} index={LINKS.length}
              onPress={() => { close(); Linking.openURL(`https://wa.me/${phone.replace(/\D/g, '').replace(/^(\d{7})$/, '960$1')}`); }} />
          )}
        </ScrollView>
        <View style={[styles.panelFoot, { borderColor: t.border }]}>
          <Pressable onPress={() => pick('/account')} accessibilityRole="link"
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.accountBtn, { backgroundColor: hovered ? t.accentStrong : t.accent }, pressed && { opacity: 0.85 }]}>
            <UserIcon color={t.accentText} />
            <ThemedText type="smallBold" style={{ color: t.accentText, fontSize: 16 }}>My account</ThemedText>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}

function DrawerLink({ label, active, onPress, p, index }: { label: string; active: boolean; onPress: () => void; p: SharedValue<number>; index: number }) {
  const t = useTheme();
  const [hover, setHover] = useState(false);
  // Each link starts a little after the one above it, sliding in from the right as it fades up.
  const a = useAnimatedStyle(() => {
    const start = 0.3 + index * 0.06;
    const k = interpolate(p.value, [start, Math.min(1, start + 0.35)], [0, 1], 'clamp');
    return { opacity: k, transform: [{ translateX: (1 - k) * 28 }] };
  });
  return (
    <Animated.View style={a}>
      <Pressable onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} accessibilityRole="link"
        style={({ pressed }) => [styles.drawerLink, (hover || pressed) && { backgroundColor: t.backgroundElement }]}>
        {active && <View style={[styles.activeBar, { backgroundColor: t.accent }]} />}
        <ThemedText style={[styles.drawerText, { color: active ? t.accent : t.text, transform: [{ translateX: hover ? 6 : 0 }] },
          Platform.OS === 'web' && ({ transitionProperty: 'transform', transitionDuration: '300ms' } as object)]}>{label}</ThemedText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  floating: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: Spacing.three, alignItems: 'center', zIndex: 10 },
  inFlow: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, alignItems: 'center' },
  bar: {
    width: '100%', maxWidth: 1216, flexDirection: 'row', alignItems: 'center', gap: Spacing.two,
    paddingVertical: Spacing.two, paddingLeft: Spacing.two + 4, paddingRight: Spacing.two, borderRadius: Radius.lg, borderWidth: 1,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginRight: 'auto' },
  brandText: { fontSize: 18, lineHeight: 22 },
  inline: { flexDirection: 'row', gap: 2 },
  inlineLink: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.md },
  account: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.md },
  book: { paddingVertical: 9, paddingHorizontal: Spacing.three + 2, borderRadius: Radius.md },
  menuBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  square: { width: 36, height: 36, borderRadius: Radius.md - 2, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  panel: { position: 'absolute', top: 0, bottom: 0, right: 0 },
  panelRaised: { borderLeftWidth: 1, boxShadow: '0 10px 40px rgba(0,0,0,0.18)' } as object,
  panelHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, borderBottomWidth: 1 },
  panelBody: { padding: Spacing.three, gap: 4 },
  drawerLink: { paddingHorizontal: Spacing.two + 4, paddingVertical: Spacing.two + 4, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center' },
  activeBar: { position: 'absolute', left: 0, top: 14, bottom: 14, width: 3, borderRadius: 2 },
  drawerText: { fontFamily: Fonts?.display, fontSize: 24, lineHeight: 30, fontWeight: '600' },
  panelFoot: { padding: Spacing.three, borderTopWidth: 1 },
  accountBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, paddingVertical: 10, borderRadius: Radius.md },
});

import { router, usePathname } from 'expo-router';
import { Tabs, TabList, TabTrigger, TabSlot, type TabTriggerSlotProps, type TabListProps } from 'expo-router/ui';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { BrandMark } from './brand';
import { ThemedText } from './themed-text';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="index" href="/" asChild>
            <TabButton>Home</TabButton>
          </TabTrigger>
          <TabTrigger name="bookings" href="/bookings" asChild>
            <TabButton>My rentals</TabButton>
          </TabTrigger>
          <TabTrigger name="account" href="/account" asChild>
            <TabButton>Account</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ref: _ref, ...props }: TabTriggerSlotProps) {
  const t = useTheme();
  const pill = useAnimatedStyle(() => ({
    opacity: withSpring(isFocused ? 1 : 0, { damping: 18 }),
    transform: [{ scale: withSpring(isFocused ? 1 : 0.85, { damping: 14 }) }],
  }));
  return (
    <Pressable {...props} style={({ pressed }) => [styles.tab, pressed && !isFocused && { opacity: 0.75 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.pill, { backgroundColor: t.accentSoft }, pill]} />
      <ThemedText type="smallBold" style={{ color: isFocused ? t.accent : t.text }}>{children}</ThemedText>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  return (
    <View {...props} style={styles.outer}>
      <NavBar>{props.children}</NavBar>
    </View>
  );
}

/** The glass brand bar. Used by the tab layout (floating) and by stack screens on web (see web-header). */
export function NavBar({ children, leading }: { children: React.ReactNode; leading?: React.ReactNode }) {
  const t = useTheme();
  const compact = useWindowDimensions().width < 720;
  const path = usePathname();
  return (
    <View
      style={[
        styles.inner,
        { borderColor: t.border, backgroundColor: t.backgroundElement + 'E6' },
        { backdropFilter: 'blur(14px)' } as object,
      ]}>
      {leading}
      <Pressable onPress={() => router.navigate('/')} accessibilityRole="link" accessibilityLabel="Rent a Motor home"
        style={({ pressed }) => [styles.brand, pressed && { opacity: 0.7 }, { cursor: 'pointer' } as object]}>
        {!(leading && compact) && (
          <BrandMark />
        )}
        {useWindowDimensions().width >= 520 && (
          <View>
            <ThemedText type="heading" style={{ fontSize: 18, lineHeight: 20 }}>Rent a Motor</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11, lineHeight: 14 }}>Kulhudhuffushi Motor Rentals</ThemedText>
          </View>
        )}
      </Pressable>
      <View style={styles.tabs}>{children}</View>
      {!compact && path !== '/book' && (
        <Pressable onPress={() => router.push('/book')} accessibilityRole="link"
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.book, { backgroundColor: hovered ? t.accentStrong : t.accent }, pressed && { transform: [{ scale: 0.97 }] }]}>
          <ThemedText type="smallBold" style={{ color: t.accentText }}>Book a ride</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    width: '100%',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    alignItems: 'center',
    zIndex: 10,
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
    borderRadius: Radius.md + 4,
    borderWidth: 1,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginRight: 'auto' },
  tabs: { flexDirection: 'row', gap: Spacing.one },
  mark: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  book: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: Radius.md, marginLeft: Spacing.one },
  tab: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: Radius.pill, justifyContent: 'center' },
  pill: { borderRadius: Radius.pill },
});

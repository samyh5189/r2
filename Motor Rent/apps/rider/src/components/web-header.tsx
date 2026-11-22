import { router, usePathname } from 'expo-router';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { NavBar } from './app-tabs.web';
import { ThemedText } from './themed-text';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/bookings', label: 'My rentals' },
  { href: '/account', label: 'Account' },
] as const;

/**
 * Web header for stack screens (bike details, sign-in, verification…): the same brand bar and tabs as
 * the main pages plus a back button, so the navigation never disappears.
 */
export function WebHeader() {
  const t = useTheme();
  const path = usePathname();
  const tight = useWindowDimensions().width < 420;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <View style={[styles.outer, { backgroundColor: t.background }]}>
      <NavBar leading={
        <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={[styles.back, { borderColor: t.accent }]}>
          <ThemedText type="heading" style={{ fontSize: 18, lineHeight: 20, color: t.accent }}>←</ThemedText>
        </Pressable>
      }>
        {LINKS.map((l) => {
          const active = path === l.href;
          return (
            <Pressable key={l.href} onPress={() => router.navigate(l.href)} accessibilityRole="link"
              style={({ pressed }) => [styles.tab, tight && { paddingHorizontal: Spacing.two }, active && { backgroundColor: t.accentSoft }, pressed && { opacity: 0.75 }]}>
              <ThemedText type="smallBold" style={{ color: active ? t.accent : t.text }}>{l.label}</ThemedText>
            </Pressable>
          );
        })}
      </NavBar>
    </View>
  );
}

/** Stack `header` option: the brand header on web, the native header elsewhere. */
export const webHeaderOption = Platform.OS === 'web' ? { header: () => <WebHeader /> } : {};

const styles = StyleSheet.create({
  outer: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.two, alignItems: 'center' },
  back: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.one },
  tab: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: Radius.pill, justifyContent: 'center' },
});

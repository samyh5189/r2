import { router, usePathname, type Href } from 'expo-router';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabBarHeight } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';

import { BikeIcon, CalendarIcon, HomeIcon, UserIcon } from './icons';
import { ThemedText } from './themed-text';

type Tab = { href: Href; label: string; match: (p: string) => boolean; Icon: typeof HomeIcon };

/** Phone tab bar for the main pages. Without an account, My rentals opens the find-my-booking page. */
export function TabBar() {
  const t = useTheme();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const tabs: Tab[] = [
    { href: '/', label: 'Home', match: (p) => p === '/', Icon: HomeIcon },
    { href: '/fleet', label: 'Fleet', match: (p) => p.startsWith('/fleet'), Icon: BikeIcon },
    { href: session ? '/bookings' : '/find', label: 'My rentals', match: (p) => p.startsWith('/bookings'), Icon: CalendarIcon },
    { href: '/account', label: 'Account', match: (p) => p.startsWith('/account'), Icon: UserIcon },
  ];
  return (
    <View accessibilityRole="tablist"
      style={[styles.bar, { backgroundColor: t.backgroundElement + 'F2', borderColor: t.border, paddingBottom: insets.bottom },
        Platform.OS === 'web' && ({ backdropFilter: 'blur(14px)' } as object)]}>
      {tabs.map(({ href, label, match, Icon }) => {
        const active = match(path);
        const c = active ? t.accent : t.textSecondary;
        return (
          <Pressable key={label} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={label}
            onPress={() => (href === '/' ? router.navigate('/') : router.navigate(href))}
            style={({ pressed }) => [styles.tab, pressed && { opacity: 0.6 }]}>
            <Icon size={24} color={c} width={active ? 2.1 : 1.8} />
            <ThemedText style={[styles.label, { color: c }]}>{label}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, height: TabBarHeight, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontSize: 11, lineHeight: 14, fontWeight: 600 },
});

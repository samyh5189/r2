import { Platform, StyleSheet, View } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

/** The EasyRide mark: a blue-to-violet tile with white ER. */
export function BrandMark({ size = 36 }: { size?: number }) {
  const t = useTheme();
  return (
    <View accessible={false} style={[styles.tile, { width: size, height: size, borderRadius: size * 0.32, backgroundColor: t.accent },
      Platform.OS === 'web' && ({ backgroundImage: `linear-gradient(135deg, ${t.accent}, ${t.violet})` } as object)]}>
      <ThemedText style={[styles.text, { fontSize: size * 0.4, lineHeight: size * 0.46 }]}>ER</ThemedText>
    </View>
  );
}

/** A booking reference, the code riders show at the counter: blue on soft blue, spaced out to read aloud. */
export function RefTag({ children, label = 'Booking reference' }: { children: string; label?: string }) {
  const t = useTheme();
  return (
    <View accessibilityLabel={`${label} ${children}`} style={[styles.ref, { backgroundColor: t.accentSoft }]}>
      <ThemedText selectable style={[styles.refText, { color: t.accent }]}>{children}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#FFFFFF', fontFamily: Fonts.display, fontWeight: '800', letterSpacing: 0.5 },
  ref: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  refText: { fontFamily: Fonts.display, fontWeight: '800', fontSize: 13, lineHeight: 18, letterSpacing: 1.2 },
});

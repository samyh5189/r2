import { StyleSheet, View } from 'react-native';

import { Fonts } from '@/constants/theme';

import { ThemedText } from './themed-text';

/**
 * A registration plate: yellow, black rim, road-sign lettering. Used for vehicle plates and booking
 * references, the two codes riders and staff read out to each other.
 */
export function Plate({ children, size = 'md', label }: { children: string; size?: 'sm' | 'md' | 'lg'; label?: string }) {
  const s = SIZES[size];
  return (
    <View accessibilityLabel={label ? `${label} ${children}` : children} style={[styles.plate, { paddingHorizontal: s.px, paddingVertical: s.py, borderRadius: s.r }]}>
      <View style={[styles.inner, { borderRadius: s.r - 2, paddingHorizontal: s.px - 2 }]}>
        <ThemedText selectable style={[styles.text, { fontSize: s.fs, lineHeight: s.fs * 1.15, letterSpacing: s.ls }]}>{children}</ThemedText>
      </View>
    </View>
  );
}

const SIZES = {
  sm: { fs: 12, px: 4, py: 2, r: 5, ls: 1 },
  md: { fs: 15, px: 5, py: 3, r: 6, ls: 1.5 },
  lg: { fs: 24, px: 6, py: 4, r: 8, ls: 3 },
} as const;

const styles = StyleSheet.create({
  plate: { backgroundColor: '#FFC629', borderWidth: 1.5, borderColor: '#0C2B33', alignSelf: 'flex-start' },
  inner: { borderWidth: 1, borderColor: 'rgba(12,43,51,0.35)', paddingVertical: 1 },
  text: { color: '#0C2B33', fontFamily: Fonts.display, fontWeight: '900', textTransform: 'uppercase' },
});

import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { avatarUrl } from '@/lib/avatar';

import { ThemedText } from './themed-text';

export const initialsOf = (name?: string | null) =>
  (name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

/** Round profile photo, falling back to initials (or a custom mark, e.g. "ER" for the office). */
export function Avatar({ path, name, size = 40, color, mark }: {
  path?: string | null; name?: string | null; size?: number; color?: string; mark?: string;
}) {
  const t = useTheme();
  const url = avatarUrl(path);
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (url) return <Image source={url} style={[style, { backgroundColor: t.backgroundSelected }]} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />;
  return (
    <View style={[style, styles.center, { backgroundColor: color ?? t.accent }]}>
      <ThemedText type="heading" style={{ color: t.accentText, fontSize: size * 0.38, lineHeight: size * 0.46 }}>
        {mark ?? (initialsOf(name) || 'R')}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });

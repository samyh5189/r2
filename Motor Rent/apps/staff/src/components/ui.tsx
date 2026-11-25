import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, type TextInputProps, View, type ViewProps } from 'react-native';

import { CardShadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

/** Pill button: primary is filled blue, secondary is white with a grey outline. */
export function Button({
  title, onPress, disabled, loading, variant = 'primary',
}: { title: string; onPress: () => void; disabled?: boolean; loading?: boolean; variant?: 'primary' | 'secondary' }) {
  const t = useTheme();
  const primary = variant === 'primary';
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: t.accent, shadowColor: t.accent, shadowOpacity: inactive ? 0 : 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: inactive ? 0 : 3 }
          : { backgroundColor: t.backgroundElement, borderWidth: 1, borderColor: t.border },
        { opacity: inactive ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed && !inactive ? 0.98 : 1 }] },
      ]}>
      {loading ? (
        <ActivityIndicator color={primary ? t.accentText : t.text} />
      ) : (
        <ThemedText type="smallBold" style={{ color: primary ? t.accentText : t.text, fontSize: 16 }}>{title}</ThemedText>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: Spacing.one + 2 }}>
      <ThemedText type="small" themeColor="textSecondary">{props.label}</ThemedText>
      <TextInput
        placeholderTextColor={t.textSecondary}
        {...props}
        style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.backgroundElement }, props.style]}
      />
    </View>
  );
}

/** White rounded panel with a soft shadow. */
export function Card({ style, ...rest }: ViewProps) {
  const t = useTheme();
  return <View style={[styles.card, CardShadow, { backgroundColor: t.backgroundElement, borderColor: t.border }, style]} {...rest} />;
}

type Tone = 'accent' | 'success' | 'danger' | 'warning' | 'neutral';

/** Small coloured status pill. */
export function Chip({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const t = useTheme();
  const c = {
    accent: [t.accentSoft, t.accent], success: [t.successSoft, t.success], danger: [t.dangerSoft, t.danger],
    warning: [t.warningSoft, t.warning], neutral: [t.backgroundSelected, t.textSecondary],
  }[tone];
  return (
    <View style={[styles.chip, { backgroundColor: c[0] }]}>
      <ThemedText type="smallBold" style={{ color: c[1], fontSize: 12, lineHeight: 16, textTransform: 'capitalize' }}>{label}</ThemedText>
    </View>
  );
}

/** Round initial (no photos in the staff app). */
export function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <ThemedText style={{ color: t.accent, fontSize: size * 0.4, lineHeight: size * 0.5, fontWeight: 800 }}>{name.slice(0, 1).toUpperCase()}</ThemedText>
    </View>
  );
}

/** Label-left, value-right row for detail cards; rows inside a Card get hairline dividers. */
export function InfoRow({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  const t = useTheme();
  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border }]}>
      <ThemedText type="small" themeColor="textSecondary" style={{ width: 96 }}>{label}</ThemedText>
      <View style={{ flex: 1 }}>{typeof children === 'string' ? <ThemedText type="smallBold">{children}</ThemedText> : children}</View>
    </View>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  const t = useTheme();
  if (!children) return null;
  return <ThemedText accessibilityRole="alert" type="small" style={{ color: t.danger }}>{children}</ThemedText>;
}

const styles = StyleSheet.create({
  button: { minHeight: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.four },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 16, paddingHorizontal: Spacing.three, fontSize: 17 },
  card: { borderRadius: 22, padding: Spacing.three + 2, gap: Spacing.two, borderWidth: StyleSheet.hairlineWidth },
  chip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 12 },
});

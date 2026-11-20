import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Platform, Pressable, StyleSheet, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type ViewProps, type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

const SPRING = { damping: 15, stiffness: 320, mass: 0.6 };

/** Pressable that squishes on press and lifts on hover (web). */
export function PressableScale({
  children, style, scaleTo = 0.97, lift = true, ...rest
}: Omit<PressableProps, 'style' | 'children'> & { children: ReactNode; style?: StyleProp<ViewStyle>; scaleTo?: number; lift?: boolean }) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const y = useSharedValue(0);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { scale: scale.value }] }));
  const to = (v: number, sv: typeof scale) => { sv.value = reduce ? v : withSpring(v, SPRING); };
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => { to(scaleTo, scale); rest.onPressIn?.(e); }}
      onPressOut={(e) => { to(1, scale); rest.onPressOut?.(e); }}
      onHoverIn={(e) => { if (lift) to(-3, y); rest.onHoverIn?.(e); }}
      onHoverOut={(e) => { to(0, y); rest.onHoverOut?.(e); }}>
      <Animated.View style={[style, a]}>{children}</Animated.View>
    </Pressable>
  );
}

export function Button({
  title, onPress, disabled, loading, variant = 'primary', icon,
}: { title: string; onPress: () => void; disabled?: boolean; loading?: boolean; variant?: 'primary' | 'secondary' | 'ghost'; icon?: ReactNode }) {
  const t = useTheme();
  const inactive = disabled || loading;
  const bg = variant === 'primary' ? '#000000' : variant === 'secondary' ? t.backgroundElement : 'transparent';
  const fg = variant === 'primary' ? '#FFFFFF' : t.text;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      lift={!inactive}
      style={[
        styles.button,
        { backgroundColor: bg, opacity: inactive ? 0.5 : 1 },
        variant === 'secondary' && { borderWidth: 1, borderColor: t.border },
        variant === 'primary' && { borderWidth: 1.5, borderColor: '#8A9A9B' },
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.buttonRow}>
          {variant === 'primary' && <View pointerEvents="none" style={styles.rim} />}
          {icon}
          <ThemedText type="smallBold" style={{ color: fg, fontSize: 16, fontWeight: 700 }}>{title}</ThemedText>
        </View>
      )}
    </PressableScale>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: Spacing.one }}>
      <ThemedText type="smallBold" themeColor="textSecondary">{label}</ThemedText>
      <TextInput
        placeholderTextColor={t.textSecondary}
        {...props}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
        style={[
          styles.input,
          { color: t.text, borderColor: focused ? t.accent : t.border, backgroundColor: t.backgroundElement },
          
          Platform.OS === 'web' && ({ outlineStyle: 'none' } as object),
          props.style,
        ]}
      />
      {hint && <ThemedText type="small" themeColor="textSecondary">{hint}</ThemedText>}
    </View>
  );
}

export function Card({ style, ...rest }: ViewProps) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.backgroundElement, borderColor: t.border }, style]} {...rest} />;
}

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' }) {
  const t = useTheme();
  const map = {
    neutral: [t.backgroundSelected, t.text],
    accent: [t.accentSoft, t.accent],
    success: [t.successSoft, t.success],
    warning: [t.warningSoft, t.warning],
    danger: [t.dangerSoft, t.danger],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <ThemedText type="smallBold" style={{ color: fg, fontSize: 12, lineHeight: 16 }}>{label}</ThemedText>
    </View>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  const t = useTheme();
  if (!children) return null;
  return (
    <View style={[styles.error, { backgroundColor: t.dangerSoft }]}>
      <ThemedText accessibilityRole="alert" type="small" style={{ color: t.danger }}>{children}</ThemedText>
    </View>
  );
}

/** Cross-platform soft shadow (boxShadow on web/new arch, elevation fallback on Android). */
export function shadow(color: string, opacity: number, blur: number): ViewStyle {
  const c = color.startsWith('#') ? hexToRgba(color, opacity) : color;
  return { boxShadow: `0 ${Math.round(blur / 3)}px ${blur}px ${c}` } as ViewStyle;
}

function hexToRgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const styles = StyleSheet.create({
  button: { minHeight: 52, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.four },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, alignSelf: 'stretch', justifyContent: 'center', minHeight: 48 },
  // Thin white inner line, like the rim on a Maldivian number plate.
  rim: { position: 'absolute', top: -0.5, bottom: -0.5, left: -20, right: -20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.65)', borderRadius: Radius.md - 3 },
  input: { minHeight: 54, borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: Spacing.three, fontSize: 17 },
  card: { borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.two, borderWidth: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.sm, alignSelf: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  error: { borderRadius: Radius.sm, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
});

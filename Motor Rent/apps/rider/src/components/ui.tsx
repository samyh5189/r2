import { ActivityIndicator, Pressable, StyleSheet, TextInput, type TextInputProps, View, type ViewProps } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

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
        { backgroundColor: primary ? t.accent : t.backgroundElement, opacity: inactive ? 0.5 : pressed ? 0.8 : 1 },
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
    <View style={{ gap: Spacing.one }}>
      <ThemedText type="small" themeColor="textSecondary">{props.label}</ThemedText>
      <TextInput
        placeholderTextColor={t.textSecondary}
        {...props}
        style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.background }, props.style]}
      />
    </View>
  );
}

export function Card({ style, ...rest }: ViewProps) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.backgroundElement }, style]} {...rest} />;
}

export function ErrorText({ children }: { children?: string | null }) {
  const t = useTheme();
  if (!children) return null;
  return <ThemedText accessibilityRole="alert" type="small" style={{ color: t.danger }}>{children}</ThemedText>;
}

const styles = StyleSheet.create({
  button: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.four },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: Spacing.three, fontSize: 17 },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
});

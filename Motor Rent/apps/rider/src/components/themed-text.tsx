import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'heading' | 'eyebrow' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return <Text style={[{ color: theme[themeColor ?? 'text'] }, styles.base, styles[type], style]} {...rest} />;
}

const display = { fontFamily: Fonts.display } as const;

const styles = StyleSheet.create({
  base: { fontFamily: Fonts.sans },
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  heading: {
    ...display,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: 800,
    letterSpacing: -0.3,
  },
  title: {
    ...display,
    fontSize: 46,
    fontWeight: 900,
    lineHeight: 46,
    letterSpacing: -1.4,
  },
  subtitle: {
    ...display,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: 800,
    letterSpacing: -0.6,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
    color: '#3c87f7',
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});

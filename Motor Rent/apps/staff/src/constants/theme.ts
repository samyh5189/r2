/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0F172A',
    background: '#F3F5FA',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EAF0FF',
    textSecondary: '#667085',
    accent: '#2F6BFF',
    accentSoft: '#EAF0FF',
    accentText: '#ffffff',
    violet: '#7A5CFF',
    border: '#E6EAF2',
    success: '#12B76A',
    successSoft: '#E7F8EF',
    danger: '#E5484D',
    dangerSoft: '#FDECEC',
    warning: '#B54708',
    warningSoft: '#FEF3E2',
  },
  dark: {
    text: '#EEF2FB',
    background: '#0B1020',
    backgroundElement: '#121A2C',
    backgroundSelected: '#1A2647',
    textSecondary: '#98A2B8',
    accent: '#5B8CFF',
    accentSoft: '#1A2647',
    accentText: '#ffffff',
    violet: '#9A82FF',
    border: '#222A3D',
    success: '#3DD68C',
    successSoft: '#0F2E21',
    danger: '#FF6369',
    dangerSoft: '#3A1418',
    warning: '#F5B451',
    warningSoft: '#33240C',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Soft card lift used on every white panel. */
export const CardShadow = {
  shadowColor: '#101828', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 2,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

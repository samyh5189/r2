/**
 * "Island ride" palette: warm sand + sunset orange by day, night road + neon by night.
 * Every screen reads colors through useTheme(), so both schemes stay in sync.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1B1A2E',
    background: '#FFF7EE',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#FFE6D3',
    textSecondary: '#6B6577',
    accent: '#FF5A1F',
    accentSoft: '#FFE1D1',
    accentText: '#FFFFFF',
    ocean: '#0E8A96',
    highlight: '#FFC24B',
    road: '#2B2D42',
    roadLine: '#FFE9A8',
    border: '#EFE2D4',
    shadow: 'rgba(120, 60, 20, 0.12)',
    success: '#13A57A',
    successSoft: '#D5F5E9',
    warning: '#C77700',
    warningSoft: '#FFF0CC',
    danger: '#D93636',
    dangerSoft: '#FDE0E0',
    skyTop: '#FF9A62',
    skyBottom: '#FFE3C2',
    sun: '#FFF1C9',
    sea: '#2BB3C0',
    palm: '#1F4E4A',
  },
  dark: {
    text: '#F5F3FF',
    background: '#0B1020',
    backgroundElement: '#151B2E',
    backgroundSelected: '#262E4A',
    textSecondary: '#A3A9C2',
    accent: '#FF7A3D',
    accentSoft: '#3A2320',
    accentText: '#FFFFFF',
    ocean: '#3CC3CF',
    highlight: '#FFC24B',
    road: '#1A1F33',
    roadLine: '#FFD66B',
    border: '#262E4A',
    shadow: 'rgba(0, 0, 0, 0.45)',
    success: '#3DD68C',
    successSoft: '#123326',
    warning: '#FFB23F',
    warningSoft: '#3A2C10',
    danger: '#FF6369',
    dangerSoft: '#3B1619',
    skyTop: '#090D1C',
    skyBottom: '#3B2A5C',
    sun: '#F4F1DE',
    sea: '#1B4F6B',
    palm: '#05070F',
  },
} as const;

export type ThemeColors = (typeof Colors)['light'] | (typeof Colors)['dark'];
export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    display: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    display: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-body)',
    display: 'var(--font-display)',
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

export const Radius = { sm: 10, md: 16, lg: 22, pill: 999 } as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
/** The web tab bar floats over the top of every tab screen. */
export const TopNavInset = Platform.select({ web: 84 }) ?? 0;
export const MaxContentWidth = 820;

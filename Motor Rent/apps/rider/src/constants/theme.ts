/**
 * Brand palette: one blue for every action, selection and link; ink text on cool grey; status colours only for status.
 * Every screen reads colors through useTheme(), so both schemes stay in sync.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0F172A',
    background: '#F3F5FA',      // soft cool grey
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EEF1F7',
    textSecondary: '#667085',
    accent: '#2F6BFF',          // brand blue: every button, selection, link and progress bar
    accentStrong: '#1F55E0',
    accentSoft: '#EAF0FF',
    accentText: '#FFFFFF',
    cta: '#2F6BFF',
    ctaText: '#FFFFFF',
    ocean: '#2F6BFF',
    highlight: '#FFC629',
    road: '#0F172A',
    roadLine: '#FFC629',
    border: '#E6EAF2',
    shadow: 'rgba(16, 24, 40, 0.08)',
    success: '#12B76A',
    successSoft: '#E7F8EF',
    warning: '#B54708',
    warningSoft: '#FEF3E2',
    danger: '#D92D20',
    dangerSoft: '#FDECEC',
    skyTop: '#8FD3E0',
    skyBottom: '#E9F6F4',
    sun: '#FFF3C4',
    sea: '#2AA6A0',
    palm: '#0F172A',
    violet: '#7A5CFF',
  },
  dark: {
    text: '#EEF2FB',
    background: '#0B1020',      // night
    backgroundElement: '#121A2C',
    backgroundSelected: '#1A2338',
    textSecondary: '#98A2B8',
    accent: '#5B8CFF',
    accentStrong: '#7AA2FF',
    accentSoft: '#1A2647',
    accentText: '#FFFFFF',
    cta: '#5B8CFF',
    ctaText: '#FFFFFF',
    ocean: '#7AA2FF',
    highlight: '#FFC629',
    road: '#121A2C',
    roadLine: '#FFC629',
    border: '#222A3D',
    shadow: 'rgba(0, 0, 0, 0.5)',
    success: '#4CC985',
    successSoft: '#10301F',
    warning: '#F2B53A',
    warningSoft: '#33280C',
    danger: '#FF8A80',
    dangerSoft: '#3A1714',
    skyTop: '#06121A',
    skyBottom: '#0F2E38',
    sun: '#F4F1DE',
    sea: '#14505A',
    palm: '#030B0E',
    violet: '#9A82FF',
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

export const Radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;

export const BottomTabInset = Platform.select({ ios: 24, android: 24 }) ?? 0;
/** Height of the phone tab bar (Home, Fleet, My rentals, Account), shown under 900 px wide. */
export const TabBarHeight = 64;
/** The site header floats over the top of the main pages (below the status bar on phones). */
export const TopNavInset = Platform.select({ web: 84, default: 76 }) ?? 84;
export const MaxContentWidth = 820;

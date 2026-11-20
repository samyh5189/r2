/**
 * Island road palette: coral-sand white, lagoon ink and teal, road-marking yellow for the one main action.
 * Every screen reads colors through useTheme(), so both schemes stay in sync.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0C2B33',            // lagoon ink
    background: '#F3F5F2',      // coral-sand white
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E3ECE9',
    textSecondary: '#55706F',
    accent: '#0B7A75',          // lagoon teal: selection, links, progress
    accentSoft: '#D7EDEA',
    accentText: '#FFFFFF',
    cta: '#FFC629',             // road-marking yellow: the main action on a screen
    ctaText: '#0C2B33',
    ocean: '#0B7A75',
    highlight: '#FFC629',
    road: '#0C2B33',
    roadLine: '#FFC629',
    border: '#D9E2DF',
    shadow: 'rgba(12, 43, 51, 0.10)',
    success: '#1D8A4E',
    successSoft: '#DDF1E4',
    warning: '#9A6400',
    warningSoft: '#FFF1C7',
    danger: '#C8423A',
    dangerSoft: '#F9E1DE',
    skyTop: '#8FD3E0',
    skyBottom: '#E9F6F4',
    sun: '#FFF3C4',
    sea: '#2AA6A0',
    palm: '#0C2B33',
  },
  dark: {
    text: '#E8F1EF',
    background: '#08171C',      // night lagoon
    backgroundElement: '#0F2229',
    backgroundSelected: '#173239',
    textSecondary: '#8DA7A6',
    accent: '#3CC2B8',
    accentSoft: '#123A3A',
    accentText: '#04211F',
    cta: '#FFC629',
    ctaText: '#0C2B33',
    ocean: '#3CC2B8',
    highlight: '#FFC629',
    road: '#0F2229',
    roadLine: '#FFC629',
    border: '#1C363D',
    shadow: 'rgba(0, 0, 0, 0.5)',
    success: '#4CC985',
    successSoft: '#10301F',
    warning: '#F2B53A',
    warningSoft: '#33280C',
    danger: '#F0776E',
    dangerSoft: '#3A1714',
    skyTop: '#06121A',
    skyBottom: '#0F2E38',
    sun: '#F4F1DE',
    sea: '#14505A',
    palm: '#030B0E',
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

export const Radius = { sm: 6, md: 12, lg: 20, pill: 999 } as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
/** The web tab bar floats over the top of every tab screen. */
export const TopNavInset = Platform.select({ web: 84 }) ?? 0;
export const MaxContentWidth = 820;

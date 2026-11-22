/**
 * Island road palette: coral-sand white, ink and teal, road-marking yellow for the one main action.
 * Every screen reads colors through useTheme(), so both schemes stay in sync.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#17181A',            // ink
    background: '#F6F4F1',      // coral-sand white
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#F1E9E7',
    textSecondary: '#61646B',
    accent: '#D7192A',          // brand red: selection, links, progress, main actions
    accentSoft: '#FBE3E5',
    accentText: '#FFFFFF',
    cta: '#D7192A',             // road-marking yellow: the main action on a screen
    ctaText: '#FFFFFF',
    ocean: '#D7192A',
    highlight: '#FFC629',
    road: '#17181A',
    roadLine: '#FFC629',
    border: '#E4DFDB',
    shadow: 'rgba(23, 24, 26, 0.10)',
    success: '#1D8A4E',
    successSoft: '#DDF1E4',
    warning: '#9A6400',
    warningSoft: '#FFF1C7',
    danger: '#A3131F',
    dangerSoft: '#F8DEDF',
    skyTop: '#8FD3E0',
    skyBottom: '#E9F6F4',
    sun: '#FFF3C4',
    sea: '#2AA6A0',
    palm: '#17181A',
  },
  dark: {
    text: '#F2EFEC',
    background: '#121214',      // night lagoon
    backgroundElement: '#1B1B1E',
    backgroundSelected: '#2A2224',
    textSecondary: '#A3A1A6',
    accent: '#FF4D5A',
    accentSoft: '#3A1418',
    accentText: '#FFFFFF',
    cta: '#E5273A',
    ctaText: '#FFFFFF',
    ocean: '#FF4D5A',
    highlight: '#FFC629',
    road: '#1B1B1E',
    roadLine: '#FFC629',
    border: '#2E2B2D',
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

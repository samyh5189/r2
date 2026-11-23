import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { Colors } from '@/constants/theme';

const SITE = 'Rent a Motor';
/** Tab titles per page (web). Anything not listed gets the site name alone. */
const TITLES: [RegExp, string][] = [
  [/^\/$/, 'Scooter and motorbike rental in Kulhudhuffushi'],
  [/^\/fleet$/, 'Fleet'],
  [/^\/prices$/, 'Prices'],
  [/^\/help$/, 'Questions'],
  [/^\/counter$/, 'Our counter'],
  [/^\/book$/, 'Book a ride'],
  [/^\/sign-in$/, 'Sign in'],
  [/^\/account$/, 'My account'],
  [/^\/bookings$/, 'My rentals'],
  [/^\/booking\//, 'Rental'],
  [/^\/verify$/, 'Verify your identity'],
  [/^\/terms$/, 'Rental terms'],
  [/^\/privacy$/, 'Privacy policy'],
  [/^\/reset-password$/, 'New password'],
];
const DESCRIPTION = 'Rent a scooter or motorbike in Kulhudhuffushi by the hour or the day. See the full price, book online and collect the keys at our counter.';

function meta(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) { el = document.createElement('meta'); el.name = name; document.head.appendChild(el); }
  el.content = content;
}

/**
 * Web-only page furniture: the tab title for each page, a meta description, the browser theme
 * colour, and a visible focus ring for keyboard users. Renders nothing.
 */
export function WebMeta() {
  const path = usePathname();
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const name = TITLES.find(([re]) => re.test(path))?.[1];
    document.title = name ? (path === '/' ? `${SITE} · ${name}` : `${name} · ${SITE}`) : SITE;
  }, [path]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    meta('description', DESCRIPTION);
    meta('theme-color', Colors.light.background);
    if (!document.getElementById('rm-focus')) {
      const style = document.createElement('style');
      style.id = 'rm-focus';
      style.textContent = `:focus-visible{outline:2px solid ${Colors.light.accent};outline-offset:2px;border-radius:6px}
input:focus-visible,textarea:focus-visible{outline:none}
@media (prefers-reduced-motion: reduce){*{scroll-behavior:auto!important}}
::selection{background:${Colors.light.accent}33}`;
      document.head.appendChild(style);
    }
  }, []);
  return null;
}

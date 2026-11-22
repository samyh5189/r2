import { useEffect, useRef, useState } from 'react';
import { useColorScheme, View } from 'react-native';

import { supabase } from '@/lib/supabase';

const CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
/** True when the Google web client ID is set; otherwise SocialButtons falls back to the redirect flow. */
export const googleIdentityAvailable = !!CLIENT_ID;

type Gsi = {
  accounts: { id: {
    initialize: (o: Record<string, unknown>) => void;
    renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
  } };
};
declare global { interface Window { google?: Gsi } }

let loader: Promise<Gsi> | null = null;
function loadGsi(): Promise<Gsi> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  loader ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (window.google ? resolve(window.google) : reject(new Error('Google sign-in did not load.')));
    s.onerror = () => { loader = null; reject(new Error('Google sign-in did not load. Check your connection.')); };
    document.head.appendChild(s);
  });
  return loader;
}

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Google's official "Continue with Google" button (Google Identity Services). Sign-in happens in a Google popup
 * on our own domain, so Google's screen names our site rather than the Supabase project. The ID token is handed
 * to Supabase with a one-time nonce (Google gets its SHA-256, Supabase checks the original).
 */
export function GoogleIdentityButton({ onSignedIn, onError }: { onSignedIn: () => void; onError: (message: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const dark = useColorScheme() === 'dark';
  const [width, setWidth] = useState(0);
  // Latest callbacks without re-rendering Google's button on every parent render.
  const cb = useRef({ onSignedIn, onError });
  useEffect(() => { cb.current = { onSignedIn, onError }; });

  useEffect(() => {
    const el = box.current;
    if (!el || !width || !CLIENT_ID) return;
    let cancelled = false;
    (async () => {
      try {
        const gsi = await loadGsi();
        const raw = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
        const hashed = await sha256Hex(raw);
        if (cancelled) return;
        gsi.accounts.id.initialize({
          client_id: CLIENT_ID,
          nonce: hashed,
          ux_mode: 'popup',
          use_fedcm_for_button: true,
          callback: async ({ credential }: { credential: string }) => {
            const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: credential, nonce: raw });
            if (error) cb.current.onError(error.message || 'Could not sign in with Google.');
            else cb.current.onSignedIn();
          },
        });
        el.innerHTML = '';
        gsi.accounts.id.renderButton(el, {
          type: 'standard', theme: dark ? 'filled_black' : 'outline', size: 'large', text: 'continue_with',
          shape: 'rectangular', logo_alignment: 'center', width: Math.max(200, Math.min(400, Math.floor(width))),
        });
      } catch (e) {
        if (!cancelled) cb.current.onError(e instanceof Error ? e.message : 'Google sign-in did not load.');
      }
    })();
    return () => { cancelled = true; };
  }, [width, dark]);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ minHeight: 44, alignItems: 'center' }}>
      <div ref={box} />
    </View>
  );
}

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from './supabase';

export type OAuthProvider = 'google' | 'apple';

WebBrowser.maybeCompleteAuthSession();

/**
 * Sign in with Google / Apple through Supabase Auth (PKCE).
 * - Web: full-page redirect to the provider; supabase-js finishes the exchange on return.
 * - iOS/Android: secure in-app browser session, then we exchange the returned code ourselves.
 * Returns true once a session exists (native) or the redirect has started (web).
 */
export async function signInWithProvider(provider: OAuthProvider): Promise<boolean> {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
    return true;
  }

  const redirectTo = Linking.createURL('auth/callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false; // user closed the sheet

  const { queryParams } = Linking.parse(result.url);
  if (queryParams?.error_description) throw new Error(String(queryParams.error_description));
  const code = queryParams?.code;
  if (typeof code !== 'string') throw new Error('Sign-in did not complete. Please try again.');
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
  return true;
}

/** Plain-language message for provider errors (e.g. provider not switched on yet in Supabase). */
export function oauthErrorMessage(provider: OAuthProvider, e: unknown) {
  const name = provider === 'google' ? 'Google' : 'Apple';
  const msg = e instanceof Error ? e.message : String(e);
  if (/not enabled|unsupported provider|provider is not/i.test(msg)) {
    return `Sign in with ${name} is not switched on yet. Use email for now.`;
  }
  return msg || `Could not sign in with ${name}.`;
}

import { useEffect, useState } from 'react';

import { supabase } from './supabase';

export type SiteSettings = { hero_image_url: string | null; hero_credit: string | null; bank_transfer_note: string };
export type BankAccount = {
  id: string; bank_name: string; account_name: string; account_number: string; currency: 'MVR' | 'USD'; swift: string | null; note: string | null;
};

let settingsCache: Promise<SiteSettings | null> | null = null;

/** Admin-editable site settings (hero photo, transfer instructions). Cached for the session. */
export function useSiteSettings() {
  const [s, setS] = useState<SiteSettings | null>(null);
  useEffect(() => {
    settingsCache ??= Promise.resolve(
      supabase.from('site_settings').select('hero_image_url, hero_credit, bank_transfer_note').maybeSingle(),
    ).then(({ data }) => (data as SiteSettings | null) ?? null, () => null);
    let live = true;
    settingsCache.then((v) => live && setS(v));
    return () => { live = false; };
  }, []);
  return s;
}

export async function loadBankAccounts(): Promise<BankAccount[]> {
  const { data } = await supabase.from('bank_accounts')
    .select('id, bank_name, account_name, account_number, currency, swift, note').eq('active', true).order('sort').order('created_at');
  return (data ?? []) as BankAccount[];
}

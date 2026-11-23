import { useEffect, useState } from 'react';

import { supabase } from './supabase';

export type SiteSettings = {
  hero_image_url: string | null; hero_credit: string | null; bank_transfer_note: string;
  support_phone: string | null; support_email: string | null;
  /** WhatsApp Cloud API connected: WhatsApp codes and automatic messages are on. */
  whatsapp_ready: boolean;
};
export type BankAccount = {
  id: string; bank_name: string; account_name: string; account_number: string; currency: 'MVR' | 'USD'; swift: string | null; note: string | null;
};

let settingsCache: Promise<SiteSettings | null> | null = null;

/** Admin-editable site settings (hero photo, transfer instructions). Cached for the session. */
export function useSiteSettings() {
  const [s, setS] = useState<SiteSettings | null>(null);
  useEffect(() => {
    settingsCache ??= Promise.resolve(
      supabase.from('site_settings').select('hero_image_url, hero_credit, bank_transfer_note, support_phone, support_email, whatsapp_ready').maybeSingle(),
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

export type Counter = {
  name: string; address: string; lat: number | null; lng: number | null;
  /** Opening hours as decimal hours (7.5 = 07:30), Maldives time. */
  open: number; close: number; label: string;
};
const hm = (s: string | undefined, fallback: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? '');
  return m ? Number(m[1]) + Number(m[2]) / 60 : fallback;
};
const clock = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
export const DEFAULT_COUNTER: Counter = {
  name: 'Kulhudhuffushi', address: 'Kulhudhuffushi, Haa Dhaalu Atoll', lat: null, lng: null, open: 7, close: 22, label: '07:00 – 22:00',
};
let counterCache: Promise<Counter> | null = null;

/** The counter riders come to (address, map position, opening hours), as set in the admin. */
export function useCounter(): Counter {
  const [c, setC] = useState<Counter>(DEFAULT_COUNTER);
  useEffect(() => {
    counterCache ??= Promise.resolve(
      supabase.from('branches').select('name, address, lat, lng, opening_hours').order('created_at').limit(1).maybeSingle(),
    ).then(({ data }) => {
      if (!data) return DEFAULT_COUNTER;
      const h = (data.opening_hours ?? {}) as { open?: string; close?: string };
      const open = hm(h.open, DEFAULT_COUNTER.open), close = hm(h.close, DEFAULT_COUNTER.close);
      return { name: data.name, address: data.address || DEFAULT_COUNTER.address, lat: data.lat, lng: data.lng, open, close, label: `${clock(open)} – ${clock(close)}` };
    }, () => DEFAULT_COUNTER);
    let live = true;
    counterCache.then((v) => live && setC(v));
    return () => { live = false; };
  }, []);
  return c;
}
export const clockLabel = clock;

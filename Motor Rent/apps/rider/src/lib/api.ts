import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Calls an Edge Function and turns its `{ error: { code, message } }` body into a typed error. */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new ApiError(payload?.error?.code ?? 'HTTP_ERROR', payload?.error?.message ?? 'Request failed.');
    }
    throw new ApiError('NETWORK', 'No connection. Check your internet and try again.');
  }
  return data as T;
}

export type QuoteResponse = {
  quoteId: string;
  expiresAt: string;
  currency: 'MVR' | 'USD';
  billableHours: number;
  rentalDays: number;
  lines: { code: string; label: string; amount: number }[];
  total: number;
  deposit: number;
};

export type GuestBookingResponse = {
  booking: { id: string; reference: string; status: string; held_until: string | null; total: number; currency: string };
};

export type CreateBookingResponse = {
  booking: { id: string; reference: string; status: string; held_until: string | null; total: number; currency: string };
  payment: { provider: 'stripe'; clientSecret: string; heldUntil: string } | { provider: 'bank_transfer'; heldUntil: string };
};

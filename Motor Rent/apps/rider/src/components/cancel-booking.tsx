import { useState } from 'react';
import { Alert, Platform, View } from 'react-native';

import { ThemedText } from './themed-text';
import { Button, ErrorText } from './ui';
import { Spacing } from '@/constants/theme';
import { ApiError, callFunction } from '@/lib/api';
import { supabase } from '@/lib/supabase';

const NOTE = 'Your payment isn’t confirmed yet, so nothing is charged. If you already sent a bank transfer, we’ll refund it.';

function confirmCancel(reference: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`Cancel booking ${reference}?\n\n${NOTE}`));
  return new Promise((resolve) => Alert.alert(`Cancel booking ${reference}?`, NOTE, [
    { text: 'Keep booking', style: 'cancel', onPress: () => resolve(false) },
    { text: 'Cancel booking', style: 'destructive', onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));
}

/** Lets the rider cancel a booking whose payment is not confirmed yet (status "held"). */
export function CancelBooking({ id, reference, onCancelled, hint = true, guestPhone }: {
  id: string; reference: string; onCancelled: () => void; hint?: boolean;
  /** Booked without an account: cancel through guest-booking, matched by reference and mobile number. */ guestPhone?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function cancel() {
    if (!(await confirmCancel(reference))) return;
    setBusy(true); setError(null);
    if (guestPhone) {
      try {
        await callFunction('guest-booking', { action: 'cancel', reference, phone: guestPhone });
      } catch (err) {
        setBusy(false);
        return setError(err instanceof ApiError ? err.message : 'Could not cancel. Check your connection and try again.');
      }
      setBusy(false);
      return onCancelled();
    }
    const { error: e } = await supabase.rpc('cancel_my_booking', { b: id });
    setBusy(false);
    if (e) return setError(e.message.replace(/^.*?ERROR:\s*/i, ''));
    onCancelled();
  }
  return (
    <View style={{ gap: Spacing.one }}>
      <Button variant="ghost" title={busy ? 'Cancelling…' : 'Cancel booking'} onPress={cancel} disabled={busy} />
      {hint && <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>You can cancel until your payment is confirmed.</ThemedText>}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

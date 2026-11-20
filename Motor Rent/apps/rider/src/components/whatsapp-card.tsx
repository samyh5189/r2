import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Field, Pill } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { ApiError, callFunction } from '@/lib/api';
import { supabase } from '@/lib/supabase';

/** "7771234" → "+9607771234". Returns null when it can't be a phone number. */
export function toE164(raw: string): string | null {
  const s = raw.replace(/[\s()-]/g, '');
  const e = /^\d{7}$/.test(s) ? `+960${s}` : s.startsWith('00') ? `+${s.slice(2)}` : s;
  return /^\+[1-9]\d{6,14}$/.test(e) ? e : null;
}

/**
 * The rider's WhatsApp number: booking updates, reminders and office replies arrive there.
 * With WhatsApp connected the number is confirmed with a code; before that it's saved as given.
 */
export function WhatsAppCard({ userId, number, verified, ready, onSaved }: {
  userId: string; number: string | null; verified: boolean; ready: boolean; onSaved: () => void;
}) {
  const [editing, setEditing] = useState(!number);
  const [value, setValue] = useState(number?.replace(/^\+960/, '') ?? '');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setEditing(!number); setValue(number?.replace(/^\+960/, '') ?? ''); }, [number]);
  const e164 = toE164(value);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  }
  const save = () => run(async () => {
    if (ready) {
      const r = await callFunction<{ phone: string }>('whatsapp-otp', { action: 'send', phone: e164!, purpose: 'link' });
      setSentTo(r.phone); setCode('');
      return;
    }
    const { error } = await supabase.from('profiles').update({ whatsapp: e164 }).eq('id', userId);
    if (error) throw new Error('Could not save the number. Check it and try again.');
    setEditing(false); onSaved();
  });
  const confirm = () => run(async () => {
    await callFunction('whatsapp-otp', { action: 'verify', phone: sentTo!, code, purpose: 'link' });
    setSentTo(null); setEditing(false); onSaved();
  });
  const remove = () => run(async () => {
    await supabase.from('profiles').update({ whatsapp: null }).eq('id', userId);
    onSaved();
  });

  return (
    <Card>
      <View style={styles.row}>
        <ThemedText type="heading" style={styles.flex}>WhatsApp</ThemedText>
        {number && <Pill label={verified ? 'Confirmed' : ready ? 'Not confirmed' : 'Saved'} tone={verified ? 'success' : ready ? 'warning' : 'neutral'} />}
      </View>
      <ThemedText type="small">Booking confirmations, pickup and return reminders, and replies from the office come to this number.</ThemedText>
      {sentTo ? (
        <>
          <ThemedText>Enter the 6-digit code we sent to {sentTo} on WhatsApp.</ThemedText>
          <Field label="Code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad"
            autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus style={{ letterSpacing: 8, fontSize: 22, textAlign: 'center' }} />
          <ErrorText>{error}</ErrorText>
          <Button title="Confirm number" onPress={confirm} disabled={code.length !== 6} loading={busy} />
          <Button title="Cancel" variant="ghost" onPress={() => setSentTo(null)} />
        </>
      ) : editing ? (
        <>
          <Field label="WhatsApp number" value={value} onChangeText={setValue} keyboardType="phone-pad" placeholder="7771234"
            autoComplete="tel" hint="Maldives numbers need no prefix. Visitors: include the country code, e.g. +44." />
          <ErrorText>{error}</ErrorText>
          <Button title={ready ? 'Send confirmation code' : 'Save number'} onPress={save} disabled={!e164} loading={busy} />
          {number && <Button title="Cancel" variant="ghost" onPress={() => setEditing(false)} />}
        </>
      ) : (
        <>
          <ThemedText type="smallBold">{number}</ThemedText>
          <ErrorText>{error}</ErrorText>
          <View style={styles.row}>
            {ready && !verified && <Button title="Confirm with a code" onPress={() => { setValue(number!.replace(/^\+960/, '')); run(async () => {
              const r = await callFunction<{ phone: string }>('whatsapp-otp', { action: 'send', phone: number!, purpose: 'link' }); setSentTo(r.phone); setCode('');
            }); }} loading={busy} />}
            <Button title="Change" variant="secondary" onPress={() => setEditing(true)} />
            <Button title="Remove" variant="ghost" onPress={remove} />
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  flex: { flex: 1 },
});

import { baseRental, billableHours } from '@motor-rent/shared';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Pill } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dateTime, money } from '@/lib/format';
import { useCounter } from '@/lib/site';
import { supabase } from '@/lib/supabase';

type Currency = 'MVR' | 'USD';
type Rates = { hourly: number; daily: number; weekly: number };
export type Extension = { id: string; new_end: string; status: 'pending' | 'approved' | 'declined' | 'withdrawn'; amount: number | null; reason: string | null; created_at: string };
export type Claim = { items: { what: string; amount: number }[]; amount: number; status: 'open' | 'disputed' | 'settled' | 'waived'; rider_note: string | null };
export type Inspection = { phase: 'pickup' | 'return'; photo_paths: string[]; odometer_km: number; fuel_level: number; created_at: string };

const friendly = (m: string) => m.replace(/^.*?ERROR:\s*/i, '').replace(/^\w/, (c) => c.toUpperCase());
const HOUR = 3_600_000;
const mvHour = (d: Date) => ((d.getUTCHours() + 5) % 24) + d.getUTCMinutes() / 60;

/**
 * "Need more time?": pick how much longer, see the estimated price, and send the request.
 * The office approves it (the bike must be free) and the extra time is added to what you pay.
 */
export function MoreTime({ bookingId, start, end, overdue, rates, currency, pending, lastDeclined, onChange }: {
  bookingId: string; start: Date; end: Date; overdue: boolean; rates: Rates | null; currency: Currency;
  pending: Extension | null; lastDeclined: Extension | null; onChange: () => void;
}) {
  const t = useTheme();
  const counter = useCounter();
  const [now] = useState(() => Date.now());
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // From the agreed return time, or (if already late) from the next full hour.
  const base = overdue ? Math.ceil(now / HOUR) * HOUR : end.getTime();
  const options = [
    { label: '+1 hour', ms: HOUR }, { label: '+3 hours', ms: 3 * HOUR },
    { label: '+1 day', ms: 24 * HOUR }, { label: '+2 days', ms: 48 * HOUR },
  ].map((o) => ({ ...o, at: new Date(base + o.ms) }))
    .filter((o) => { const h = mvHour(o.at); return h >= counter.open && h <= counter.close; });
  const chosen = options.find((o) => o.ms === pick) ?? null;
  const price = chosen && rates
    ? Math.max(0, baseRental(billableHours(start, chosen.at), rates) - baseRental(billableHours(start, end), rates)) : null;

  async function send() {
    if (!chosen) return;
    setBusy(true); setError(null);
    const { error } = await supabase.rpc('request_extension', { b: bookingId, p_new_end: chosen.at.toISOString() });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    setPick(null);
    onChange();
  }
  async function withdraw() {
    if (!pending) return;
    setBusy(true);
    const { error } = await supabase.rpc('withdraw_extension', { x: pending.id });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    onChange();
  }

  if (pending) {
    return (
      <Card style={styles.gap}>
        <View style={styles.row}>
          <ThemedText type="smallBold" style={{ fontSize: 16 }}>More time requested</ThemedText>
          <Pill label="Waiting for the office" tone="warning" />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          New return time {dateTime(pending.new_end)}. We’ll confirm the price here and on WhatsApp. Until then, the original return time stands.
        </ThemedText>
        <Button variant="secondary" size="sm" title="Withdraw request" onPress={withdraw} loading={busy} />
        <ErrorText>{error}</ErrorText>
      </Card>
    );
  }
  return (
    <Card style={styles.gap}>
      <ThemedText type="smallBold" style={{ fontSize: 16 }}>Need more time?</ThemedText>
      {lastDeclined && (
        <ThemedText type="small" style={{ color: t.danger }}>
          Your last request was declined{lastDeclined.reason ? `: ${lastDeclined.reason}` : '.'}
        </ThemedText>
      )}
      {options.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">Message us below and we’ll sort out a new return time.</ThemedText>
      ) : (
        <>
          <View style={styles.chips}>
            {options.map((o) => {
              const on = o.ms === pick;
              return (
                <Pressable key={o.label} onPress={() => setPick(on ? null : o.ms)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                  style={[styles.chip, { borderColor: on ? t.accent : t.border, backgroundColor: on ? t.accentSoft : 'transparent' }]}>
                  <ThemedText type="smallBold" style={{ color: on ? t.accent : t.text }}>{o.label}</ThemedText>
                </Pressable>
              );
            })}
          </View>
          {chosen && (
            <ThemedText type="small" themeColor="textSecondary">
              Return by {dateTime(chosen.at)}{price != null ? ` · about ${money(price, currency)} more` : ''}. The office confirms if the bike is free.
            </ThemedText>
          )}
          <Button title="Ask for more time" onPress={send} disabled={!chosen} loading={busy} />
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

/** Damage found at the return: what, how much, the photos, and a way to reply. */
export function ClaimCard({ bookingId, claim, currency, onChange }: { bookingId: string; claim: Claim; currency: Currency; onChange: () => void }) {
  const t = useTheme();
  const [note, setNote] = useState('');
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tone = claim.status === 'waived' ? 'success' : claim.status === 'settled' ? 'neutral' : 'warning';
  const label = { open: 'Waiting for you', disputed: 'You replied', settled: 'Settled', waived: 'Waived' }[claim.status];

  async function dispute() {
    setBusy(true); setError(null);
    const { error } = await supabase.rpc('dispute_damage_claim', { b: bookingId, p_note: note });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    setWriting(false);
    onChange();
  }

  return (
    <Card style={styles.gap}>
      <View style={styles.row}>
        <ThemedText type="smallBold" style={{ fontSize: 16 }}>Damage found at return</ThemedText>
        <Pill label={label} tone={tone} />
      </View>
      {claim.items.map((it, i) => (
        <View key={i} style={styles.row}>
          <ThemedText type="small" style={{ flex: 1 }}>{it.what}</ThemedText>
          <ThemedText type="smallBold">{money(it.amount, currency)}</ThemedText>
        </View>
      ))}
      <View style={[styles.row, styles.total, { borderColor: t.border }]}>
        <ThemedText type="smallBold">{claim.status === 'settled' ? 'Agreed' : 'Total'}</ThemedText>
        <ThemedText type="smallBold">{money(claim.amount, currency)}</ThemedText>
      </View>
      {claim.status === 'open' && (
        <ThemedText type="small" themeColor="textSecondary">
          Compare with your pickup and return photos below. If you agree, pay at the counter. If you don’t, tell us why and we’ll review it.
        </ThemedText>
      )}
      {claim.status === 'disputed' && claim.rider_note && <ThemedText type="small" themeColor="textSecondary">You said: “{claim.rider_note}”. The office is reviewing it.</ThemedText>}
      {claim.status === 'waived' && <ThemedText type="small" themeColor="textSecondary">Nothing to pay for this.</ThemedText>}
      {claim.status === 'open' && (writing ? (
        <View style={styles.gap}>
          <TextInput value={note} onChangeText={setNote} multiline maxLength={1000} placeholder="What happened? e.g. the scratch was there at pickup (see photo 3)"
            placeholderTextColor={t.textSecondary} style={[styles.input, { color: t.text, borderColor: t.border }]} />
          <Button title="Send my reply" onPress={dispute} disabled={note.trim().length < 5} loading={busy} />
        </View>
      ) : <Button variant="secondary" size="sm" title="I don’t agree" onPress={() => setWriting(true)} />)}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

/** The photos taken with you at pickup and at return, so you can check the record. */
export function HandoverPhotos({ inspections }: { inspections: Inspection[] }) {
  const t = useTheme();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [big, setBig] = useState<string | null>(null);
  const paths = inspections.flatMap((i) => i.photo_paths);
  const key = paths.join('|');
  useEffect(() => {
    if (!key) return;
    let live = true;
    supabase.storage.from('inspections').createSignedUrls(key.split('|'), 3600).then(({ data }) => {
      if (!live || !data) return;
      setUrls(Object.fromEntries(data.flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl] as const] : []))));
    });
    return () => { live = false; };
  }, [key]);
  if (!inspections.length) return null;
  return (
    <View style={{ gap: Spacing.three }}>
      <ThemedText type="subtitle">Handover photos</ThemedText>
      {inspections.map((i) => (
        <Card key={i.phase} style={styles.gap}>
          <View style={styles.row}>
            <ThemedText type="smallBold" style={{ fontSize: 16 }}>{i.phase === 'pickup' ? 'At pickup' : 'At return'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{dateTime(i.created_at)}</ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">Odometer {i.odometer_km.toLocaleString()} km · fuel {i.fuel_level}/8</ThemedText>
          <View style={styles.grid}>
            {i.photo_paths.map((p, n) => (
              <Pressable key={p} onPress={() => setBig(big === p ? null : p)} accessibilityRole="imagebutton" accessibilityLabel={`${i.phase} photo ${n + 1}`}
                style={[styles.thumb, { backgroundColor: t.backgroundSelected }]}>
                {urls[p] && <Image source={{ uri: urls[p] }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />}
                <ThemedText style={styles.num}>{n + 1}</ThemedText>
              </Pressable>
            ))}
          </View>
          {big && i.photo_paths.includes(big) && urls[big] && (
            <Pressable onPress={() => setBig(null)} accessibilityLabel="Close photo">
              <Image source={{ uri: urls[big] }} style={styles.big} contentFit="contain" transition={200} />
            </Pressable>
          )}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderWidth: 1.5, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  total: { borderTopWidth: 1, paddingTop: Spacing.two },
  input: { borderWidth: 1.5, borderRadius: 12, padding: Spacing.three, minHeight: 90, fontSize: 15, textAlignVertical: 'top' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  thumb: { width: 76, height: 76, borderRadius: 12, overflow: 'hidden' },
  num: { position: 'absolute', left: 6, bottom: 4, color: '#fff', fontSize: 12, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
  big: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12 },
});

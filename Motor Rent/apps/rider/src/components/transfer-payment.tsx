import { analyzeSlip, type Currency, type SlipCheck } from '@motor-rent/shared';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dateTime, money } from '@/lib/format';
import { ocrAvailable, ocrImage } from '@/lib/ocr';
import { loadBankAccounts, useSiteSettings, type BankAccount } from '@/lib/site';
import { supabase } from '@/lib/supabase';

import { ThemedText } from './themed-text';
import { Button, Card, ErrorText, Pill, PressableScale } from './ui';

export type PayableBooking = { id: string; reference: string; total: number; currency: string; status: string; held_until: string | null };
type Slip = { id: string; status: 'pending' | 'approved' | 'rejected'; reject_reason: string | null; created_at: string };

function CopyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const t = useTheme();
  const [copied, setCopied] = useState(false);
  async function copy() {
    await Clipboard.setStringAsync(value.replace(/\s/g, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <View style={styles.copyRow}>
      <View style={{ flex: 1 }}>
        <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
        <ThemedText type="heading" selectable style={mono ? { fontVariant: ['tabular-nums'], letterSpacing: 1.5, fontSize: 18 } : { fontSize: 17 }}>{value}</ThemedText>
      </View>
      <PressableScale accessibilityRole="button" accessibilityLabel={`Copy ${label}`} onPress={copy}
        style={[styles.copyBtn, { backgroundColor: copied ? t.successSoft : t.backgroundElement, borderWidth: 1.5, borderColor: copied ? t.success : t.accent }]}>
        <ThemedText type="smallBold" style={{ color: copied ? t.success : t.accent }}>{copied ? 'Copied ✓' : 'Copy'}</ThemedText>
      </PressableScale>
    </View>
  );
}

/**
 * Bank-transfer payment for a held booking: our account details (copyable), the exact amount and
 * reference, then slip upload. On web the slip is OCR-checked instantly; staff always approve it.
 */
export function TransferPayment({ booking, onChange }: { booking: PayableBooking; onChange?: () => void }) {
  const t = useTheme();
  const settings = useSiteSettings();
  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [slip, setSlip] = useState<Slip | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [check, setCheck] = useState<SlipCheck | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const [acc, s] = await Promise.all([
      loadBankAccounts(),
      supabase.from('transfer_slips').select('id, status, reject_reason, created_at').eq('booking_id', booking.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setAccounts(acc);
    setSlip((s.data as Slip | null) ?? null);
  }, [booking.id]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(i); }, []);

  const heldUntil = booking.held_until ? new Date(booking.held_until).getTime() : null;
  const minutesLeft = heldUntil ? Math.max(0, Math.round((heldUntil - now) / 60000)) : null;
  const expired = booking.status !== 'held' || (heldUntil != null && heldUntil < now);

  async function pickAndSend() {
    setError(null);
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return setError('Allow photo access to upload your slip.');
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: Platform.OS !== 'web' });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    setPreview(asset.uri);
    setCheck(null);
    try {
      setBusy('Preparing…');
      const blob = await (await fetch(asset.uri)).blob();
      if (blob.size > 8 * 1024 * 1024) throw new Error('That image is over 8 MB. Take a screenshot of the slip instead.');
      const type = /png/.test(blob.type) ? 'png' : /webp/.test(blob.type) ? 'webp' : 'jpg';

      let ocr: { text: string; check: SlipCheck } | null = null;
      if (ocrAvailable) {
        setBusy('Reading your slip…');
        try {
          const text = await ocrImage(blob);
          const c = analyzeSlip(text, { total: booking.total, reference: booking.reference, accountNumbers: (accounts ?? []).map((a) => a.account_number) });
          setCheck(c);
          ocr = { text: text.slice(0, 4000), check: c };
        } catch { /* OCR is optional; staff will check by eye */ }
      }

      setBusy('Uploading…');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Please sign in again.');
      const path = `${user.id}/${booking.id}/${Date.now()}.${type}`;
      const body = Platform.OS === 'web' ? blob : await (await fetch(asset.uri)).arrayBuffer();
      const up = await supabase.storage.from('payment-slips').upload(path, body, { contentType: `image/${type === 'jpg' ? 'jpeg' : type}` });
      if (up.error) throw new Error(up.error.message);
      const { error: rpcError } = await supabase.rpc('submit_transfer_slip', { p_booking: booking.id, p_path: path, p_ocr: ocr });
      if (rpcError) throw new Error(rpcError.message);
      await refresh();
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed. Try again.');
    } finally {
      setBusy(null);
    }
  }

  if (slip?.status === 'approved' || booking.status === 'confirmed') {
    return (
      <Card style={{ borderColor: t.success }}>
        <Pill label="Payment confirmed" tone="success" />
        <ThemedText type="small" themeColor="textSecondary">Your transfer was received. Show reference {booking.reference} at pickup.</ThemedText>
      </Card>
    );
  }

  if (slip?.status === 'pending') {
    return (
      <Animated.View entering={FadeIn}>
        <Card style={{ gap: Spacing.two }}>
          <Pill label="Slip under review" tone="warning" />
          <ThemedText type="heading">We’re checking your transfer</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            The vehicle stays reserved while we confirm the money arrived{booking.held_until ? ` (until ${dateTime(booking.held_until)})` : ''}. You’ll see “Confirmed” here once approved.
          </ThemedText>
          {check && <OcrSummary check={check} total={booking.total} currency={booking.currency} />}
        </Card>
      </Animated.View>
    );
  }

  if (expired) {
    return (
      <Card>
        <Pill label="Reservation expired" tone="danger" />
        <ThemedText type="small" themeColor="textSecondary">The payment window has closed. If you already transferred, contact the rental office with reference {booking.reference}.</ThemedText>
      </Card>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(450)} style={{ gap: Spacing.three }}>
      <Card style={{ gap: Spacing.three }}>
        <View style={styles.headRow}>
          <ThemedText type="heading">Pay by bank transfer</ThemedText>
          {minutesLeft != null && <Pill label={minutesLeft > 90 ? `Held until ${dateTime(booking.held_until!)}` : `${minutesLeft} min left`} tone={minutesLeft < 15 ? 'danger' : 'warning'} />}
        </View>

        {slip?.status === 'rejected' && (
          <View style={[styles.notice, { backgroundColor: t.dangerSoft }]}>
            <ThemedText type="smallBold" style={{ color: t.danger }}>Your last slip was not accepted</ThemedText>
            {slip.reject_reason && <ThemedText type="small" style={{ color: t.danger }}>{slip.reject_reason}</ThemedText>}
          </View>
        )}

        <View style={[styles.amountBox, { backgroundColor: t.accentSoft }]}>
          <ThemedText type="small" themeColor="textSecondary">Transfer exactly</ThemedText>
          <ThemedText type="title" style={{ fontSize: 34, lineHeight: 38, color: t.accent }}>{money(booking.total, booking.currency as Currency)}</ThemedText>
        </View>

        <CopyRow label="Remark / reference (required)" value={booking.reference} mono />

        {accounts === null ? <ActivityIndicator color={t.accent} /> : !accounts.length ? (
          <ThemedText type="small" themeColor="textSecondary">Bank details are not set up yet. Please contact the rental office to pay.</ThemedText>
        ) : accounts.map((a) => (
          <View key={a.id} style={[styles.account, { borderColor: t.border }]}>
            <ThemedText type="eyebrow" themeColor="textSecondary">{a.bank_name} · {a.currency}</ThemedText>
            <CopyRow label="Account number" value={a.account_number} mono />
            <CopyRow label="Account name" value={a.account_name} />
            {a.swift && <ThemedText type="small" themeColor="textSecondary">SWIFT {a.swift}</ThemedText>}
            {a.note && <ThemedText type="small" themeColor="textSecondary">{a.note}</ThemedText>}
          </View>
        ))}

        {settings?.bank_transfer_note && <ThemedText type="small" themeColor="textSecondary">{settings.bank_transfer_note}</ThemedText>}
      </Card>

      <Card style={{ gap: Spacing.three }}>
        <ThemedText type="heading">Upload your transfer slip</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">A screenshot of the receipt from your bank app works best. We check the amount, reference and account.</ThemedText>
        {preview && <Image source={{ uri: preview }} style={[styles.preview, { borderColor: t.border }]} contentFit="contain" />}
        {check && <OcrSummary check={check} total={booking.total} currency={booking.currency} />}
        <ErrorText>{error}</ErrorText>
        <Button title={busy ?? (slip?.status === 'rejected' ? 'Upload a new slip' : 'Upload slip')} onPress={pickAndSend} loading={!!busy} disabled={!!busy || !accounts?.length} />
      </Card>
    </Animated.View>
  );
}

function OcrSummary({ check, total, currency }: { check: SlipCheck; total: number; currency: string }) {
  const t = useTheme();
  const row = (ok: boolean, text: string) => (
    <View style={styles.checkRow} key={text}>
      <ThemedText type="smallBold" style={{ color: ok ? t.success : t.warning, width: 18 }}>{ok ? '✓' : '!'}</ThemedText>
      <ThemedText type="small" style={{ flex: 1 }}>{text}</ThemedText>
    </View>
  );
  return (
    <View style={[styles.notice, { backgroundColor: t.backgroundSelected }]}>
      <ThemedText type="eyebrow" themeColor="textSecondary">What we read</ThemedText>
      {row(check.amountMatches, check.amounts.length ? `Amount ${money(check.amounts[0]!, currency as Currency)}${check.amountMatches ? '' : ` — expected ${money(total, currency as Currency)}`}` : 'Could not find the amount')}
      {row(check.referenceFound, check.referenceFound ? 'Booking reference found' : 'Reference not found in the remark')}
      {row(check.accountFound, check.accountFound ? 'Paid to our account' : 'Could not confirm our account number')}
      <ThemedText type="small" themeColor="textSecondary">Our team confirms every payment. This is just a quick check.</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: Spacing.two },
  amountBox: { borderRadius: Radius.md, padding: Spacing.three, alignItems: 'center', gap: 2 },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  copyBtn: { borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, minHeight: 40, justifyContent: 'center' },
  account: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.two },
  notice: { borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.one },
  preview: { height: 220, borderRadius: Radius.md, borderWidth: 1 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});

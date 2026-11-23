import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { SignaturePad } from '@/components/signature-pad';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, ErrorText, Field } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, callFunction } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { AGREEMENT_SUMMARY } from '@motor-rent/shared';

const ANGLES = ['front', 'back', 'left', 'right', 'dashboard', 'close-ups'] as const;
type Shot = (typeof ANGLES)[number];

export default function InspectionScreen() {
  const { id, phase, odo, hrs } = useLocalSearchParams<{ id: string; phase: 'pickup' | 'return'; odo: string; hrs?: string }>();
  const t = useTheme();
  const [shots, setShots] = useState<Partial<Record<Shot, string>>>({});
  const [fuel, setFuel] = useState<number | null>(null);
  const [odometer, setOdometer] = useState('');
  const [notes, setNotes] = useState('');
  const [hours, setHours] = useState('');
  const [noMeter, setNoMeter] = useState(false);
  const [riderSig, setRiderSig] = useState<string | null>(null);
  const [staffSig, setStaffSig] = useState<string | null>(null);
  const [scrollLocked, setScrollLocked] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minOdo = Number(odo) || 0;
  const odoNum = Number(odometer);
  const odoValid = odometer !== '' && Number.isInteger(odoNum) && odoNum >= minOdo;
  const minHrs = hrs ? Number(hrs) : 0;
  const hrsNum = Number(hours);
  const hrsValid = noMeter || (/^\d{1,6}(\.\d)?$/.test(hours) && hrsNum >= minHrs);
  const complete = ANGLES.every((a) => shots[a]) && fuel !== null && odoValid && hrsValid && !!riderSig && !!staffSig && (phase !== 'pickup' || accepted);

  async function take(shot: Shot) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setError('Camera permission is needed for inspections.');
    // Camera only (no gallery): photos must be taken now, at the counter.
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6, exif: true });
    if (!res.canceled && res.assets[0]) setShots((s) => ({ ...s, [shot]: res.assets[0]!.uri }));
  }

  async function upload(shot: Shot, uri: string) {
    const path = `${id}/${phase}/${shot}-${Date.now()}.jpg`;
    const body = await (await fetch(uri)).arrayBuffer();
    const { error } = await supabase.storage.from('inspections').upload(path, body, { contentType: 'image/jpeg', upsert: false });
    if (error) throw new Error(`Upload failed (${shot}). Check signal and retry.`);
    return path;
  }

  async function uploadSignature(who: 'rider' | 'staff', svg: string) {
    const path = `${id}/${phase}/${who}-signature-${Date.now()}.svg`;
    const body = new TextEncoder().encode(svg);
    const { error } = await supabase.storage.from('inspections').upload(path, body, { contentType: 'image/svg+xml', upsert: false });
    if (error) throw new Error(`Saving the ${who} signature failed. Check signal and retry.`);
    return path;
  }

  async function submit() {
    setBusy(true); setError(null);
    try {
      // TODO: offline queue — persist shots locally and retry when back online.
      const photoPaths = await Promise.all(ANGLES.map((a) => upload(a, shots[a]!)));
      const [riderSignaturePath, staffSignaturePath] = await Promise.all([
        uploadSignature('rider', riderSig!), uploadSignature('staff', staffSig!),
      ]);
      const res = await callFunction<{ status: string; lateFee?: number }>('submit-inspection', {
        bookingId: id, phase, photoPaths, fuelLevel: fuel, odometerKm: odoNum, notes: notes || undefined,
        engineHours: noMeter ? null : Math.round(hrsNum * 10) / 10,
        riderSignaturePath, staffSignaturePath, agreementAccepted: phase === 'pickup' ? accepted : undefined,
      });
      if (res.lateFee && res.lateFee > 0) {
        const msg = `Returned late. Collect a late fee of Rf ${(res.lateFee / 100).toFixed(2)} before closing.`;
        if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Late return', msg);
      }
      router.back();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Submit failed.');
    } finally { setBusy(false); }
  }

  const tile = (shot: Shot, label: string) => (
    <Pressable key={shot} onPress={() => take(shot)} accessibilityRole="button" accessibilityLabel={`Photo: ${label}`}
      style={[styles.tile, { borderColor: shots[shot] ? t.success : t.border }]}>
      {shots[shot] ? <Image source={shots[shot]} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      <ThemedText type="small" style={styles.tileLabel}>{shots[shot] ? '✓ ' : '+ '}{label}</ThemedText>
    </Pressable>
  );

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.body} scrollEnabled={!scrollLocked}>
        <ThemedText type="smallBold">{phase === 'pickup' ? 'Pickup' : 'Return'} — 6 photos required</ThemedText>
        <View style={styles.grid}>{ANGLES.map((a) => tile(a, a))}</View>

        <ThemedText type="smallBold">Fuel (eighths of a tank)</ThemedText>
        <View style={styles.grid}>
          {Array.from({ length: 9 }, (_, n) => (
            <Pressable key={n} onPress={() => setFuel(n)} accessibilityRole="radio" accessibilityState={{ selected: fuel === n }}
              style={[styles.fuel, { borderColor: fuel === n ? t.accent : t.border }]}>
              <ThemedText type="small">{n === 0 ? 'E' : n === 8 ? 'F' : `${n}/8`}</ThemedText>
            </Pressable>
          ))}
        </View>

        <Field label={`Odometer km (last recorded ${minOdo})`} value={odometer}
          onChangeText={(v) => setOdometer(v.replace(/\D/g, ''))} keyboardType="number-pad" />
        {odometer !== '' && !odoValid && <ErrorText>{`Odometer cannot be lower than ${minOdo}.`}</ErrorText>}

        <Field label="Notes (existing scratches, issues)" value={notes} onChangeText={setNotes} multiline style={{ minHeight: 88 }} />

        <View style={[styles.section, { borderColor: t.border }]}>
          <ThemedText type="smallBold">Engine running hours — {phase === 'pickup' ? 'before delivery' : 'after collection'}</ThemedText>
          <Field label={hrs ? `Hour meter (last recorded ${hrs} h)` : 'Hour meter reading (h)'} value={noMeter ? '' : hours}
            editable={!noMeter} placeholder="e.g. 1234.5"
            onChangeText={(v) => setHours(v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))} keyboardType="decimal-pad" />
          {!noMeter && hours !== '' && !hrsValid && (
            <ErrorText>{hrsNum < minHrs ? `Hours cannot be lower than ${minHrs}.` : 'Use a number with at most one decimal, e.g. 1234.5'}</ErrorText>
          )}
          <Pressable onPress={() => setNoMeter((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: noMeter }} style={styles.checkRow}>
            <View style={[styles.box, { borderColor: noMeter ? t.accent : t.border, backgroundColor: noMeter ? t.accent : 'transparent' }]}>
              {noMeter && <ThemedText type="smallBold" style={{ color: '#fff', lineHeight: 16 }}>✓</ThemedText>}
            </View>
            <ThemedText type="small">This vehicle has no hour meter</ThemedText>
          </Pressable>
        </View>

        {phase === 'pickup' && (
          <View style={[styles.section, { borderColor: t.border }]}>
            <ThemedText type="smallBold">Rental agreement</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Read these out to the rider. Their signature signs the agreement; the PDF is on the booking in the admin.</ThemedText>
            {AGREEMENT_SUMMARY.map((line) => <ThemedText key={line} type="small">• {line}</ThemedText>)}
            <Pressable onPress={() => setAccepted((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} style={styles.checkRow}>
              <View style={[styles.box, { borderColor: accepted ? t.accent : t.border, backgroundColor: accepted ? t.accent : 'transparent' }]}>
                {accepted && <ThemedText type="smallBold" style={{ color: '#fff', lineHeight: 16 }}>✓</ThemedText>}
              </View>
              <ThemedText type="small" style={{ flex: 1 }}>The rider has read and accepts the rental agreement, including responsibility for fines, offences and criminal acts during the rental.</ThemedText>
            </Pressable>
          </View>
        )}

        <View style={[styles.section, { borderColor: t.border }]}
          onTouchStart={() => setScrollLocked(true)} onTouchEnd={() => setScrollLocked(false)} onTouchCancel={() => setScrollLocked(false)}>
          <ThemedText type="small" themeColor="textSecondary">
            {phase === 'pickup'
              ? 'Rider confirms the vehicle condition above and receives the keys.'
              : 'Rider confirms the vehicle was returned in the condition above.'}
          </ThemedText>
          <SignaturePad label="Rider signature" onChange={setRiderSig} />
          <SignaturePad label="Staff signature" onChange={setStaffSig} />
        </View>

        <ErrorText>{error}</ErrorText>
        <Button title={phase === 'pickup' ? 'Complete pickup & hand over keys' : 'Complete return'}
          onPress={submit} disabled={!complete} loading={busy} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.three, gap: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { width: 104, height: 104, borderRadius: 12, borderWidth: 2, overflow: 'hidden', justifyContent: 'flex-end' },
  tileLabel: { padding: Spacing.one, backgroundColor: '#0008', color: '#fff' },
  section: { borderWidth: 1, borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 44 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  fuel: { minWidth: 52, minHeight: 44, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});

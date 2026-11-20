import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, ErrorText, Field } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, callFunction } from '@/lib/api';
import { supabase } from '@/lib/supabase';

const ANGLES = ['front', 'back', 'left', 'right', 'dashboard', 'close-ups'] as const;
type Shot = (typeof ANGLES)[number] | 'signed-form';

export default function InspectionScreen() {
  const { id, phase, odo } = useLocalSearchParams<{ id: string; phase: 'pickup' | 'return'; odo: string }>();
  const t = useTheme();
  const [shots, setShots] = useState<Partial<Record<Shot, string>>>({});
  const [fuel, setFuel] = useState<number | null>(null);
  const [odometer, setOdometer] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minOdo = Number(odo) || 0;
  const odoNum = Number(odometer);
  const odoValid = odometer !== '' && Number.isInteger(odoNum) && odoNum >= minOdo;
  const complete = ANGLES.every((a) => shots[a]) && !!shots['signed-form'] && fuel !== null && odoValid;

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

  async function submit() {
    setBusy(true); setError(null);
    try {
      // TODO: offline queue — persist shots locally and retry when back online.
      const photoPaths = await Promise.all(ANGLES.map((a) => upload(a, shots[a]!)));
      const formPath = await upload('signed-form', shots['signed-form']!);
      await callFunction('submit-inspection', {
        bookingId: id, phase, photoPaths, fuelLevel: fuel, odometerKm: odoNum, notes: notes || undefined,
        // TODO: on-screen signature pad (rider + staff). Until then the signed handover form photo is the signature.
        riderSignaturePath: formPath, staffSignaturePath: formPath,
      });
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
      <ScrollView contentContainerStyle={styles.body}>
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

        <ThemedText type="smallBold">Signed handover form</ThemedText>
        <View style={styles.grid}>{tile('signed-form', 'signed form')}</View>

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
  fuel: { minWidth: 52, minHeight: 44, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});

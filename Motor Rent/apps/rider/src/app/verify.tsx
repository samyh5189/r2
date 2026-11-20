import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, ErrorText, Field, Pill, PressableScale } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type DocType = 'licence_front' | 'licence_back' | 'national_id' | 'passport' | 'selfie';
type Submission = { id: string; status: 'pending' | 'approved' | 'rejected'; note: string | null; created_at: string };
type Picked = { uri: string; mime: string; ext: string };

const DOCS: { type: DocType; label: string; hint: string; optional?: boolean; selfie?: boolean }[] = [
  { type: 'licence_front', label: 'Driving licence — front', hint: 'All four corners visible, no glare' },
  { type: 'licence_back', label: 'Driving licence — back', hint: 'Optional', optional: true },
  { type: 'national_id', label: 'ID card', hint: 'Front side with your photo' },
  { type: 'selfie', label: 'Selfie', hint: 'Your face, clearly lit, no sunglasses', selfie: true },
];

/** DD/MM/YYYY → YYYY-MM-DD (or null). */
function parseDate(s: string): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function friendly(msg: string) {
  return msg.replace(/^.*?ERROR:\s*/i, '').replace(/^\w/, (c) => c.toUpperCase());
}

export default function VerifyScreen() {
  const t = useTheme();
  const { session, loading } = useSession();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [latest, setLatest] = useState<Submission | null | undefined>(undefined);
  const [verified, setVerified] = useState<{ until: string } | null>(null);

  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [idType, setIdType] = useState<'national_id' | 'passport'>('national_id');
  const [idNumber, setIdNumber] = useState('');
  const [licenceNo, setLicenceNo] = useState('');
  const [licenceExp, setLicenceExp] = useState('');
  const [files, setFiles] = useState<Partial<Record<DocType, Picked>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const [{ data: sub }, { data: prof }] = await Promise.all([
      supabase.from('kyc_submissions').select('id, status, note, created_at').eq('profile_id', session.user.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('profiles').select('full_name, kyc_status, licence_expires_on').eq('id', session.user.id).single(),
    ]);
    setLatest((sub as Submission | null) ?? null);
    if (prof?.kyc_status === 'approved' && prof.licence_expires_on && new Date(prof.licence_expires_on) > new Date()) {
      setVerified({ until: prof.licence_expires_on });
    }
    setFullName((n) => n || prof?.full_name || session.user.user_metadata?.full_name || '');
  }, [session]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!loading && !session) router.replace('/sign-in'); }, [loading, session]);

  async function pick(type: DocType, camera: boolean) {
    setError(null);
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : Platform.OS === 'web' ? { granted: true } : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError(camera ? 'Allow camera access to take the photo.' : 'Allow photo access to choose the picture.');
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, cameraType: type === 'selfie' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back };
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    const mime = a.mimeType ?? 'image/jpeg';
    if (!/^image\/(jpeg|png|heic)$/.test(mime)) return setError('Please use a JPEG or PNG photo.');
    if (a.fileSize && a.fileSize > 10 * 1024 * 1024) return setError('That photo is over 10 MB.');
    setFiles((f) => ({ ...f, [type]: { uri: a.uri, mime, ext: mime === 'image/png' ? 'png' : mime === 'image/heic' ? 'heic' : 'jpg' } }));
  }

  const dobIso = parseDate(dob);
  const expIso = parseDate(licenceExp);
  const required: DocType[] = ['licence_front', idType, 'selfie'];
  const ready = fullName.trim().length >= 2 && !!dobIso && !!expIso && idNumber.trim().length >= 3 && licenceNo.trim().length >= 3
    && required.every((d) => files[d]);

  async function submit() {
    if (!session) return;
    setError(null);
    try {
      const batch = `${Date.now()}`;
      const docs: { doc_type: DocType; path: string }[] = [];
      const entries = Object.entries(files) as [DocType, Picked][];
      for (const [i, [type, f]] of entries.entries()) {
        if (type === 'national_id' && idType !== 'national_id') continue;
        if (type === 'passport' && idType !== 'passport') continue;
        setBusy(`Uploading ${i + 1}/${entries.length}…`);
        const path = `${session.user.id}/${batch}/${type}.${f.ext}`;
        const body = Platform.OS === 'web' ? await (await fetch(f.uri)).blob() : await (await fetch(f.uri)).arrayBuffer();
        const { error } = await supabase.storage.from('kyc').upload(path, body, { contentType: f.mime });
        if (error) throw new Error(`Upload failed — check your connection and try again.`);
        docs.push({ doc_type: type, path });
      }
      setBusy('Submitting…');
      const { error } = await supabase.rpc('submit_kyc', {
        p_full_name: fullName.trim(), p_date_of_birth: dobIso, p_id_type: idType, p_id_number: idNumber.trim(),
        p_licence_number: licenceNo.trim(), p_licence_expires_on: expIso, p_docs: docs,
      });
      if (error) throw new Error(friendly(error.message));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally { setBusy(null); }
  }

  if (latest === undefined) return <ThemedView style={[styles.flex, styles.center]}><ActivityIndicator color={t.accent} /></ThemedView>;

  if (verified || latest?.status === 'pending') {
    return (
      <ThemedView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.body}>
          <Animated.View>
            <Card style={{ alignItems: 'center', gap: Spacing.two }}>
              <Pill label={verified ? 'Verified' : 'Under review'} tone={verified ? 'success' : 'warning'} />
              <ThemedText type="subtitle" style={{ textAlign: 'center' }}>{verified ? 'You’re verified' : 'Thanks — we’re checking'}</ThemedText>
              <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
                {verified
                  ? `Your licence is on file until ${verified.until}. You can book any vehicle.`
                  : 'Our team reviews documents within about an hour during opening times. You can come back to book once you’re verified.'}
              </ThemedText>
            </Card>
          </Animated.View>
          <Button title={next ? 'Continue booking' : 'Browse vehicles'} onPress={() => (next ? router.replace(next as never) : router.replace('/'))} />
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ gap: Spacing.one }}>
          <ThemedText type="subtitle">Verify your identity</ThemedText>
          <ThemedText themeColor="textSecondary">Once, before your first rental. Your documents are private: only our staff can see them.</ThemedText>
        </Animated.View>

        {latest?.status === 'rejected' && (
          <Card style={{ borderColor: t.danger }}>
            <Pill label="Please resubmit" tone="danger" />
            <ThemedText type="small">{latest.note ?? 'Your last documents could not be verified.'}</ThemedText>
          </Card>
        )}

        <Card style={{ gap: Spacing.three }}>
          <ThemedText type="heading">Your details</ThemedText>
          <Field label="Full name (as on your ID)" value={fullName} onChangeText={setFullName} autoComplete="name" />
          <Field label="Date of birth (DD/MM/YYYY)" value={dob} onChangeText={setDob} placeholder="21/04/1995" keyboardType="numbers-and-punctuation"
            hint={dob && !dobIso ? 'Use DD/MM/YYYY' : undefined} />
          <View style={styles.segment}>
            {(['national_id', 'passport'] as const).map((k) => (
              <PressableScale key={k} onPress={() => setIdType(k)} accessibilityRole="radio" accessibilityState={{ selected: idType === k }}
                style={[styles.segBtn, { borderColor: idType === k ? t.accent : t.border, backgroundColor: idType === k ? t.accentSoft : 'transparent' }]}>
                <ThemedText type="smallBold" style={{ color: idType === k ? t.accent : t.text }}>{k === 'national_id' ? 'Maldivian ID card' : 'Passport'}</ThemedText>
              </PressableScale>
            ))}
          </View>
          <Field label={idType === 'passport' ? 'Passport number' : 'ID card number'} value={idNumber} onChangeText={setIdNumber} autoCapitalize="characters" />
          <Field label="Driving licence number" value={licenceNo} onChangeText={setLicenceNo} autoCapitalize="characters" />
          <Field label="Licence expiry date (DD/MM/YYYY)" value={licenceExp} onChangeText={setLicenceExp} placeholder="30/06/2029" keyboardType="numbers-and-punctuation"
            hint={licenceExp && !expIso ? 'Use DD/MM/YYYY' : undefined} />
        </Card>

        <Card style={{ gap: Spacing.three }}>
          <ThemedText type="heading">Photos</ThemedText>
          {DOCS.map((d) => d.type === 'national_id' ? { ...d, type: idType, label: idType === 'passport' ? 'Passport photo page' : 'ID card' } : d).map((d) => {
            const f = files[d.type];
            return (
              <View key={d.type} style={[styles.doc, { borderColor: f ? t.success : t.border }]}>
                <View style={[styles.thumb, { backgroundColor: t.backgroundSelected }]}>
                  {f ? <Image source={{ uri: f.uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <ThemedText type="small" themeColor="textSecondary">{d.selfie ? '🙂' : '🪪'}</ThemedText>}
                </View>
                <View style={styles.flex}>
                  <ThemedText type="smallBold">{f ? '✓ ' : ''}{d.label}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{d.hint}</ThemedText>
                  <View style={styles.docBtns}>
                    {Platform.OS !== 'web' && (
                      <PressableScale onPress={() => pick(d.type, true)} style={[styles.small, { backgroundColor: t.accentSoft }]}>
                        <ThemedText type="smallBold" style={{ color: t.accent }}>Take photo</ThemedText>
                      </PressableScale>
                    )}
                    <PressableScale onPress={() => pick(d.type, false)} style={[styles.small, { backgroundColor: t.backgroundSelected }]}>
                      <ThemedText type="smallBold">{f ? 'Replace' : Platform.OS === 'web' ? 'Upload photo' : 'From gallery'}</ThemedText>
                    </PressableScale>
                  </View>
                </View>
              </View>
            );
          })}
        </Card>

        <ErrorText>{error}</ErrorText>
        <Button title={busy ?? 'Submit for verification'} onPress={submit} loading={!!busy} disabled={!ready || !!busy} />
        {!ready && <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>Fill in all details and add the licence front, your {idType === 'passport' ? 'passport' : 'ID card'} and a selfie.</ThemedText>}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  body: { padding: Spacing.three, gap: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', paddingBottom: Spacing.six },
  segment: { flexDirection: 'row', gap: Spacing.two },
  segBtn: { flex: 1, borderWidth: 1.5, borderRadius: Radius.md, paddingVertical: Spacing.two, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  doc: { flexDirection: 'row', gap: Spacing.three, borderWidth: 1.5, borderRadius: Radius.md, padding: Spacing.two },
  thumb: { width: 72, height: 72, borderRadius: Radius.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  docBtns: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one, flexWrap: 'wrap' },
  small: { borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: 6, minHeight: 36, justifyContent: 'center' },
});

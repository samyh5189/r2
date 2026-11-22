import { useEffect, useState } from 'react';
import { Linking, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { ClockIcon, PinIcon } from '@/components/icons';
import { ArrowLink, OPENING, OpenNow, Page, PageHead, Panel, pageStyles, Reveal, whatsappUrl } from '@/components/page-kit';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSiteSettings } from '@/lib/site';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';

type Branch = { name: string; address: string | null; lat: number | null; lng: number | null };

/** Where to collect and return the bike, and when the counter is open. */
export default function CounterScreen() {
  const t = useTheme();
  const site = useSiteSettings();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [branches, setBranches] = useState<Branch[]>([]);
  useEffect(() => {
    supabase.from('branches').select('name, address, lat, lng').order('name').then(({ data }) => setBranches((data ?? []) as Branch[]));
  }, []);
  const phone = site?.support_phone;
  return (
    <Page>
      <PageHead kicker="Kulhudhuffushi" title="Our counter." lead="Collect your bike and bring it back here. Show your booking reference and we hand over the keys." />
      <View style={[{ marginTop: Spacing.six, gap: Spacing.three }, wide && { flexDirection: 'row', alignItems: 'flex-start' }]}>
        {branches.map((b, i) => (
          <Reveal key={b.name} delay={120 + i * 80} style={wide ? { flex: 1.3 } : undefined}>
            <Panel style={{ gap: Spacing.three, padding: 0, overflow: 'hidden' }}>
              <PinStage />
              <View style={{ padding: Spacing.four, paddingTop: 0, gap: Spacing.three }}>
                <ThemedText style={[pageStyles.display, { fontSize: 30, lineHeight: 34, letterSpacing: -1, color: t.text }]}>{b.name}</ThemedText>
                <View style={styles.line}>
                  <PinIcon color={t.accent} />
                  <ThemedText themeColor="textSecondary" style={styles.lineText}>{b.address ?? b.name}</ThemedText>
                </View>
                <View style={styles.line}>
                  <ClockIcon color={t.accent} />
                  <ThemedText themeColor="textSecondary" style={styles.lineText}>Pickup and return every day, {OPENING.label}</ThemedText>
                </View>
                <Button title="Book a ride" onPress={() => router.push('/book')} />
                {b.lat != null && b.lng != null && (
                  <Button variant="secondary" title="Open in Maps" onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lng}`)} />
                )}
              </View>
            </Panel>
          </Reveal>
        ))}
        <Reveal delay={220} style={wide ? { flex: 1 } : undefined}>
          <Panel tone="soft" style={{ gap: Spacing.three }}>
            <ThemedText style={[pageStyles.display, { fontSize: 26, lineHeight: 30, letterSpacing: -0.8, color: t.text }]}>Opening hours</ThemedText>
            <OpenNow />
            <View style={styles.hours}>
              <ThemedText themeColor="textSecondary" style={{ fontSize: 15 }}>Every day</ThemedText>
              <View style={[styles.chip, { backgroundColor: t.backgroundElement, borderColor: t.border }]}>
                <ThemedText type="smallBold">{OPENING.label}</ThemedText>
              </View>
            </View>
            <ThemedText themeColor="textSecondary" style={{ fontSize: 15, lineHeight: 22 }}>Times are Maldives time. Bookings start and end inside these hours.</ThemedText>
            {phone && <ArrowLink label="Message us on WhatsApp" onPress={() => Linking.openURL(whatsappUrl(phone))} />}
            <ArrowLink label="Questions" href="/help" />
          </Panel>
        </Reveal>
      </View>
    </Page>
  );
}

/** A soft island-coloured stage with a red pin and a pulsing ring under it. */
function PinStage() {
  const t = useTheme();
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (!reduce) p.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.bezier(0, 0, 0.58, 1) }), -1, false);
  }, [reduce, p]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - p.value), transform: [{ scale: 0.6 + p.value * 1.6 }] }));
  return (
    <View style={[styles.stage, { backgroundColor: t.backgroundSelected }]}>
      <View style={[styles.island, { backgroundColor: t.backgroundElement, borderColor: t.border }]} />
      <Animated.View style={[styles.ring, { backgroundColor: t.accent }, ring]} />
      <View style={[styles.pin, { backgroundColor: t.accent, borderColor: t.backgroundElement }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  lineText: { fontSize: 16, lineHeight: 22, flex: 1 },
  hours: { gap: Spacing.two },
  chip: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 8, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  stage: { height: 180, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  island: { position: 'absolute', width: 230, height: 96, borderRadius: 60, borderWidth: 1, transform: [{ rotate: '-14deg' }] },
  ring: { position: 'absolute', width: 56, height: 56, borderRadius: 28 },
  pin: { width: 18, height: 18, borderRadius: 9, borderWidth: 3 },
});

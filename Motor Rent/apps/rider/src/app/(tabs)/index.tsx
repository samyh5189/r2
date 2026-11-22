import { router } from 'expo-router';
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { After, LaneMarkings, RisingHeadline } from '@/components/hero-motion';
import { KenBurns, StockPhotos } from '@/components/photo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing, TopNavInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSiteSettings } from '@/lib/site';

/** Home: the hero and how booking works. Rentals and sign-in live under My account (side menu). */
export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 640;
  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.list}>
        <Hero wide={wide} />
        <Welcome />
      </ScrollView>
    </ThemedView>
  );
}

function Hero({ wide }: { wide: boolean }) {
  const site = useSiteSettings();
  const custom = site?.hero_image_url;
  const credit = custom ? site?.hero_credit : 'Sinamalé Bridge, photo by Panda 51 (CC BY-SA 4.0)';
  const height = (wide ? 460 : 420) + TopNavInset;
  const headline = 'Ride Kulhudhuffushi.';
  return (
    <View style={styles.heroWrap}>
      <KenBurns source={custom ? { uri: custom } : StockPhotos.hero} height={height} focus={{ top: custom ? '50%' : '55%', left: '50%' }} scrimTop={0.15} scrimBottom={0.85}>
        <View style={[styles.heroText, { paddingBottom: wide ? Spacing.five : Spacing.four }]}>
          <View style={styles.heroInner}>
            <View style={{ maxWidth: 680 }}>
              <RisingHeadline text={headline} style={[styles.onPhoto, { fontSize: wide ? 76 : 46, lineHeight: wide ? 76 : 48, letterSpacing: wide ? -2 : -1 }]} />
            </View>
            <LaneMarkings color="#FFFFFF" width={wide ? 220 : 160} delay={150 + headline.split(' ').length * 90 + 200} />
            <After delay={150 + headline.split(' ').length * 90 + 450}>
              <View style={{ gap: Spacing.three }}>
                <ThemedText style={[styles.onPhotoMuted, { fontSize: 17, lineHeight: 25, maxWidth: 420 }]}>
                  Scooters and motorbikes by the hour or the day. Choose your times, pick a bike, collect the keys.
                </ThemedText>
                <View style={{ alignSelf: 'flex-start', minWidth: 230 }}>
                  <Button variant="cta" title="Book a ride" onPress={() => router.push('/book')} />
                </View>
              </View>
            </After>
          </View>
        </View>
        {!!credit && <ThemedText type="small" style={styles.credit} numberOfLines={1}>{credit}</ThemedText>}
      </KenBurns>
    </View>
  );
}

/** How booking works, then book or browse the fleet. */
function Welcome() {
  const t = useTheme();
  const steps = [
    ['Pick your times', 'Pickup and return at our counter, any time from 07:00 to 22:00.'],
    ['Choose a bike', 'You only see bikes that are free for your times, with the full price.'],
    ['Verify once, then ride', 'Upload your licence and ID before your first rental. Show your reference at the counter.'],
  ];
  return (
    <View style={styles.section}>
      <ThemedText type="subtitle">How it works</ThemedText>
      {steps.map(([title, body], i) => (
        <View key={title} style={styles.howRow}>
          <View style={[styles.howNum, { backgroundColor: t.accent }]}><ThemedText type="smallBold" style={{ color: t.accentText }}>{i + 1}</ThemedText></View>
          <View style={styles.flex}>
            <ThemedText type="smallBold" style={{ fontSize: 17 }}>{title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{body}</ThemedText>
          </View>
        </View>
      ))}
      <View style={styles.quick}>
        <Button title="Book a ride" onPress={() => router.push('/book')} />
        <Button variant="secondary" title="See the fleet" onPress={() => router.push('/fleet')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: {
    paddingHorizontal: Spacing.three, paddingBottom: BottomTabInset + Spacing.five, gap: Spacing.four,
    maxWidth: MaxContentWidth + Spacing.three * 2, width: '100%', alignSelf: 'center',
  },
  heroWrap: Platform.select({ web: { width: '100vw', marginLeft: 'calc(50% - 50vw)', overflow: 'hidden' } as object, default: { marginHorizontal: -Spacing.three, overflow: 'hidden' } })!,
  heroText: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.three, alignItems: 'center' },
  heroInner: { gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth },
  onPhoto: { color: '#FFFFFF' },
  onPhotoMuted: { color: 'rgba(255,255,255,0.88)' },
  credit: { position: 'absolute', right: Spacing.three, top: TopNavInset + Spacing.two, fontSize: 10, lineHeight: 13, color: 'rgba(255,255,255,0.7)' },
  section: { gap: Spacing.three, maxWidth: 640, width: '100%' },
  howRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  howNum: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  quick: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
});

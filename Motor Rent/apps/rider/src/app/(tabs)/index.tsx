import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { ModelCarousel, useModels } from '@/components/fleet-cards';
import { ArrowDownIcon } from '@/components/icons';
import {
  ArrowLink, DrawnRule, EASE_IN_OUT, Panel, pageStyles, Question, ReadyToRide, Reveal, RiseTitle, SectionTitle, SiteFooter,
} from '@/components/page-kit';
import { KenBurns, StockPhotos } from '@/components/photo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { Spacing, TopNavInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { FAQ } from '@/lib/faq';
import { useSiteSettings } from '@/lib/site';

/** Home: hero, the fleet, how booking works, questions, then book. Rentals and sign-in live under My account. */
export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 640;
  const gutter = wide ? Spacing.five : Spacing.three;
  const models = useModels();
  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <Hero wide={wide} />
        <View style={[styles.body, { paddingHorizontal: gutter }]}>
          {models && models.length > 0 && (
            <View style={styles.section}>
              <SectionTitle title="The fleet" sub="Well-kept scooters and motorbikes, shown with the full day price." />
              <ModelCarousel models={models} onView />
              <Reveal onView><ArrowLink label="See the whole fleet" href="/fleet" /></Reveal>
            </View>
          )}
          <HowItWorks wide={width >= 900} />
          <View style={styles.section}>
            <SectionTitle title="Questions" />
            <Reveal onView>
              <Panel style={{ paddingVertical: Spacing.one, maxWidth: 820 }}>
                {FAQ.slice(0, 4).map((f, i) => <Question key={f.q} q={f.q} a={f.a} first={i === 0} />)}
              </Panel>
            </Reveal>
            <Reveal onView><ArrowLink label="All questions" href="/help" /></Reveal>
          </View>
          <ReadyToRide />
        </View>
        <SiteFooter />
      </ScrollView>
    </ThemedView>
  );
}

function Hero({ wide }: { wide: boolean }) {
  const site = useSiteSettings();
  const custom = site?.hero_image_url;
  const credit = custom ? site?.hero_credit : 'Sinamalé Bridge, photo by Panda 51 (CC BY-SA 4.0)';
  const height = (wide ? 520 : 480) + TopNavInset;
  const size = wide ? 76 : 46;
  return (
    <View style={styles.heroWrap}>
      <KenBurns source={custom ? { uri: custom } : StockPhotos.hero} height={height} focus={{ top: custom ? '50%' : '55%', left: '50%' }} scrimTop={0.15} scrimBottom={0.85}>
        <View style={[styles.heroText, { paddingBottom: wide ? Spacing.six : Spacing.five, paddingHorizontal: wide ? Spacing.five : Spacing.three }]}>
          <View style={styles.heroInner}>
            <Reveal duration={900} rise={8}>
              <ThemedText style={[pageStyles.kicker, { color: 'rgba(255,255,255,0.9)' }]}>Haa Dhaalu Atoll</ThemedText>
            </Reveal>
            <View style={{ maxWidth: 720, marginTop: Spacing.two }}>
              <RiseTitle text="Ride Kulhudhuffushi." size={size} color="#FFFFFF" start={120} step={80} duration={1000} />
            </View>
            <DrawnRule color="#FFFFFF" delay={500} width={104} style={{ marginTop: Spacing.four }} />
            <Reveal delay={650} duration={900}>
              <View style={{ gap: Spacing.three, marginTop: Spacing.four }}>
                <ThemedText style={{ color: 'rgba(255,255,255,0.88)', fontSize: 17, lineHeight: 25, maxWidth: 440 }}>
                  Scooters and motorbikes by the hour or the day. Choose your times, pick a bike, collect the keys.
                </ThemedText>
                <View style={{ alignSelf: 'flex-start', minWidth: 230 }}>
                  <Button variant="cta" title="Book a ride" onPress={() => router.push('/book')} />
                </View>
              </View>
            </Reveal>
          </View>
        </View>
        {wide && <ScrollCue />}
        {!!credit && <ThemedText type="small" style={styles.credit} numberOfLines={1}>{credit}</ThemedText>}
      </KenBurns>
    </View>
  );
}

/** "Scroll" with an arrow that bobs up and down. */
function ScrollCue() {
  const reduce = useReducedMotion();
  const y = useSharedValue(-3);
  useEffect(() => {
    if (!reduce) y.value = withRepeat(withSequence(withTiming(3, { duration: 1200, easing: EASE_IN_OUT }), withTiming(-3, { duration: 1200, easing: EASE_IN_OUT })), -1, false);
  }, [reduce, y]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Reveal delay={900} style={styles.cue}>
      <View style={styles.cueRow}>
        <View style={styles.cueCircle}><Animated.View style={a}><ArrowDownIcon size={16} color="#FFFFFF" /></Animated.View></View>
        <ThemedText style={[pageStyles.kicker, { color: 'rgba(255,255,255,0.8)', fontSize: 11 }]}>Scroll</ThemedText>
      </View>
    </Reveal>
  );
}

/** Three steps joined by a line, each revealing as it scrolls in. */
function HowItWorks({ wide }: { wide: boolean }) {
  const t = useTheme();
  const steps = [
    ['Pick your times', 'Pickup and return at our counter, any time from 07:00 to 22:00.'],
    ['Choose a bike and pay', 'You only see bikes free for your times, with the full price. Pay by bank transfer to confirm.'],
    ['Collect and ride', 'Verify your licence and ID once, then show your reference at the counter.'],
  ];
  return (
    <View style={styles.section}>
      <SectionTitle title="How booking works" />
      <View style={[{ gap: Spacing.four }, wide && { flexDirection: 'row' }]}>
        {steps.map(([title, body], i) => (
          <Reveal key={title} onView delay={i * 120} style={[styles.step, wide && { flex: 1 }]}>
            <View style={styles.stepHead}>
              <View style={[styles.stepNum, { backgroundColor: t.accent }]}>
                <ThemedText type="smallBold" style={{ color: t.accentText }}>{i + 1}</ThemedText>
              </View>
              {wide && i < steps.length - 1 && <View style={[styles.stepLine, { backgroundColor: t.border }]} />}
            </View>
            <ThemedText style={[pageStyles.display, { fontSize: 21, lineHeight: 26, color: t.text }]}>{title}</ThemedText>
            <ThemedText themeColor="textSecondary" style={{ fontSize: 16, lineHeight: 24 }}>{body}</ThemedText>
          </Reveal>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { maxWidth: 1296, width: '100%', alignSelf: 'center', paddingTop: Spacing.six, paddingBottom: Spacing.six, gap: Spacing.six + Spacing.three },
  section: { gap: Spacing.four },
  heroWrap: Platform.select({ web: { width: '100%', overflow: 'hidden' } as object, default: { overflow: 'hidden' } })!,
  heroText: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  heroInner: { width: '100%', maxWidth: 1296 },
  credit: { position: 'absolute', right: Spacing.three, top: TopNavInset + Spacing.two, fontSize: 10, lineHeight: 13, color: 'rgba(255,255,255,0.7)' },
  cue: { position: 'absolute', right: Spacing.five, bottom: Spacing.six },
  cueRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cueCircle: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  step: { gap: Spacing.two },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginBottom: Spacing.one },
  stepNum: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stepLine: { flex: 1, height: 1 },
});

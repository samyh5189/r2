import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming,
} from 'react-native-reanimated';

import { ThemedText } from './themed-text';

const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

/** One word that rises out of a mask. */
function Word({ word, delay, style }: { word: string; delay: number; style: StyleProp<TextStyle> }) {
  const reduce = useReducedMotion();
  const y = useSharedValue(reduce ? 0 : 1);
  useEffect(() => { if (!reduce) y.value = withDelay(delay, withTiming(0, { duration: 700, easing: EASE })); }, [reduce, delay, y]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value * 90 }], opacity: 1 - y.value * 0.6 }));
  return (
    <View style={styles.mask}>
      <Animated.View style={a}><ThemedText type="title" style={style}>{word}</ThemedText></Animated.View>
    </View>
  );
}

/** Headline that rises in word by word: the single load moment on the home screen. */
export function RisingHeadline({ text, style, start = 150, step = 90 }: { text: string; style: StyleProp<TextStyle>; start?: number; step?: number }) {
  const words = text.split(' ');
  return (
    <View style={styles.line} accessible accessibilityRole="header" accessibilityLabel={text}>
      {words.map((w, i) => <Word key={i} word={w} delay={start + i * step} style={style} />)}
    </View>
  );
}

/** Fades and lifts its children in after `delay` ms (for what follows the headline). */
export function After({ delay, children }: { delay: number; children: ReactNode }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => { if (!reduce) p.value = withDelay(delay, withTiming(1, { duration: 600, easing: EASE })); }, [reduce, delay, p]);
  const a = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 14 }] }));
  return <Animated.View style={a}>{children}</Animated.View>;
}

/** Yellow lane markings sliding past, like riding along the road. Static when reduced motion is on. */
export function LaneMarkings({ color, width = 180, dash = 26, gap = 16, delay = 600 }: { color: string; width?: number; dash?: number; gap?: number; delay?: number }) {
  const reduce = useReducedMotion();
  const span = dash + gap;
  const x = useSharedValue(0);
  const grow = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    grow.value = withDelay(delay, withTiming(1, { duration: 700, easing: EASE }));
    x.value = withDelay(delay, withRepeat(withTiming(-span, { duration: 520, easing: Easing.linear }), -1, false));
  }, [reduce, delay, span, grow, x]);
  const track = useAnimatedStyle(() => ({ width: width * grow.value }));
  const move = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const count = Math.ceil(width / span) + 2;
  return (
    <Animated.View style={[styles.lane, track]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.dashes, move]}>
        {Array.from({ length: count }, (_, i) => <View key={i} style={{ width: dash, height: 6, marginRight: gap, backgroundColor: color, borderRadius: 1 }} />)}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14 },
  mask: { overflow: 'hidden', paddingBottom: 4 },
  lane: { height: 6, overflow: 'hidden' },
  dashes: { flexDirection: 'row' },
});

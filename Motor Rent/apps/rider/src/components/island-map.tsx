import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

import { EASE, EASE_IN_OUT } from './page-kit';
import { ThemedText } from './themed-text';

/**
 * Kulhudhuffushi's coastline, traced from OpenStreetMap (© OpenStreetMap contributors, ODbL),
 * projected to a 1000-unit-wide box (north up). COUNTER is the branch's position in the same box.
 */
const ISLAND = 'M0.0 134.3 L9.3 146.0 L41.2 148.1 L84.7 185.7 L91.2 229.3 L94.4 269.1 L101.9 326.2 L116.0 373.5 L97.8 390.3 L69.7 416.4 L101.1 416.4 L126.2 450.6 L148.9 516.1 L149.1 537.3 L141.7 542.9 L130.9 543.5 L117.9 544.9 L109.2 545.5 L102.7 547.1 L141.4 739.4 L69.0 757.9 L70.1 762.7 L79.7 790.4 L78.7 817.3 L60.5 833.7 L82.7 965.4 L108.0 1087.7 L52.5 1119.4 L49.3 1121.7 L49.4 1126.1 L51.9 1127.8 L55.1 1127.3 L116.0 1091.8 L90.4 976.9 L184.4 964.0 L232.5 1166.9 L135.7 1184.3 L124.7 1133.2 L122.0 1130.2 L118.4 1129.8 L114.7 1131.5 L93.6 1143.1 L93.7 1146.7 L95.5 1149.2 L98.7 1149.2 L118.6 1138.9 L127.3 1182.1 L123.5 1184.4 L122.2 1188.5 L123.4 1192.1 L130.4 1202.6 L138.9 1207.0 L144.1 1206.4 L163.7 1233.1 L174.4 1245.4 L179.0 1249.7 L183.7 1251.8 L276.7 1236.1 L298.1 1236.3 L325.8 1252.2 L340.5 1265.7 L357.3 1280.4 L303.7 1357.7 L255.9 1423.1 L215.9 1392.3 L210.9 1399.2 L280.1 1452.1 L440.8 1514.3 L455.6 1526.2 L460.7 1527.3 L459.6 1513.7 L450.5 1506.3 L464.9 1494.1 L489.5 1483.0 L515.5 1482.9 L538.4 1492.1 L556.5 1510.9 L578.9 1529.5 L597.6 1548.2 L615.4 1569.4 L634.9 1575.1 L648.0 1578.7 L670.1 1578.3 L697.5 1573.3 L724.9 1556.4 L757.8 1537.3 L828.8 1458.2 L870.2 1377.3 L893.9 1329.3 L941.8 1213.2 L974.3 1100.3 L1000.0 944.9 L998.7 775.8 L964.2 657.2 L920.2 548.4 L894.9 525.8 L881.2 496.5 L859.7 441.1 L809.0 365.3 L720.5 323.8 L652.3 255.1 L567.4 175.2 L524.9 143.4 L459.7 96.2 L382.5 43.9 L305.3 11.1 L240.9 0.0 L149.8 9.2 L59.0 10.1 L54.7 21.6 L40.3 27.7 L38.1 36.2 L23.3 47.1 L13.3 80.2 L8.5 109.7 L0.0 134.3 Z';
const COAST_LENGTH = 5506;
const BOX = { w: 1000, h: 1579 };
const COUNTER = { x: 590, y: 849 };
const PAD = 90;

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * The island map: the coastline draws itself, the land fills in, then the pin drops onto our
 * counter and keeps pulsing. Everything is static when reduced motion is on.
 */
export function IslandMap({ height = 340, label = 'Our counter' }: { height?: number; label?: string }) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const draw = useSharedValue(reduce ? 1 : 0);
  const fill = useSharedValue(reduce ? 1 : 0);
  const pin = useSharedValue(reduce ? 1 : 0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    draw.value = withDelay(150, withTiming(1, { duration: 1600, easing: EASE_IN_OUT }));
    fill.value = withDelay(900, withTiming(1, { duration: 900, easing: EASE }));
    pin.value = withDelay(1500, withSpring(1, { damping: 11, stiffness: 140 }));
    pulse.value = withDelay(1900, withRepeat(withTiming(1, { duration: 2400, easing: Easing.bezier(0, 0, 0.58, 1) }), -1, false));
  }, [reduce, draw, fill, pin, pulse]);

  const coast = useAnimatedProps(() => ({ strokeDashoffset: COAST_LENGTH * (1 - draw.value) }));
  const land = useAnimatedProps(() => ({ fillOpacity: fill.value }));

  // Scale from map units to on-screen pixels (the map is fitted to the height).
  const vbW = BOX.w + PAD * 2;
  const vbH = BOX.h + PAD * 2;
  const scale = height / vbH;
  const width = vbW * scale;
  const px = (COUNTER.x + PAD) * scale;
  const py = (COUNTER.y + PAD) * scale;

  const drop = useAnimatedStyle(() => ({ opacity: Math.min(1, pin.value * 1.4), transform: [{ translateY: (1 - pin.value) * -36 }, { scale: 0.6 + 0.4 * pin.value }] }));
  const ring = useAnimatedStyle(() => ({ opacity: pin.value * 0.5 * (1 - pulse.value), transform: [{ scale: 0.4 + pulse.value * 1.8 }] }));
  const tag = useAnimatedStyle(() => ({ opacity: pin.value, transform: [{ translateX: (1 - pin.value) * -10 }] }));

  return (
    <View style={{ width, height }} accessibilityRole="image" accessibilityLabel={`Map of Kulhudhuffushi with ${label.toLowerCase()} marked`}>
      <Svg width={width} height={height} viewBox={`${-PAD} ${-PAD} ${vbW} ${vbH}`}>
        <AnimatedPath d={ISLAND} fill={t.backgroundElement} stroke="none" animatedProps={land} />
        <AnimatedPath d={ISLAND} fill="none" stroke={t.text} strokeOpacity={0.55} strokeWidth={5} strokeLinejoin="round"
          strokeDasharray={[COAST_LENGTH, COAST_LENGTH]} animatedProps={coast} />
      </Svg>
      <Animated.View pointerEvents="none" style={[styles.ring, { left: px - 30, top: py - 30, backgroundColor: t.accent }, ring]} />
      <Animated.View pointerEvents="none" style={[styles.pinWrap, { left: px - 11, top: py - 11 }, drop]}>
        <View style={[styles.pin, { backgroundColor: t.accent, borderColor: t.backgroundElement }]} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.tag, { left: px + 18, top: py - 15, backgroundColor: t.text }, tag]}>
        <ThemedText style={{ color: t.background, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>{label}</ThemedText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', width: 60, height: 60, borderRadius: 30 },
  pinWrap: { position: 'absolute', width: 22, height: 22 },
  pin: { width: 22, height: 22, borderRadius: 11, borderWidth: 4, boxShadow: '0 6px 14px rgba(0,0,0,0.3)' } as object,
  tag: { position: 'absolute', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
});

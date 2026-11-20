import { Image, type ImageProps } from 'expo-image';
import { useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useOscillate } from './motion';

export type VehicleKind = 'scooter' | 'motorbike' | 'car';

/** Real photos used until a manager uploads the vehicle's own photos (see assets/images/stock/CREDITS.md). */
export const StockPhotos = {
  hero: require('@/assets/images/stock/hero.jpg'),
  male: require('@/assets/images/stock/male.jpg'),
  scooter: require('@/assets/images/stock/scooter.jpg'),
  motorbike: require('@/assets/images/stock/motorbike.jpg'),
  car: require('@/assets/images/stock/car.jpg'),
} as const;

export function vehiclePhotos(v: { photos?: string[] | null; kind?: VehicleKind | null }): ImageProps['source'][] {
  const own = (v.photos ?? []).filter(Boolean);
  return own.length ? own.map((uri) => ({ uri })) : [StockPhotos[v.kind ?? 'scooter']];
}

/** Bottom-weighted dark scrim so white text stays readable on any photo. */
export function Scrim({ from = 0, to = 0.75, top = 0.25 }: { from?: number; to?: number; top?: number }) {
  const id = `scrim${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1 1" pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0B1020" stopOpacity={top} />
          <Stop offset="0.45" stopColor="#0B1020" stopOpacity={from} />
          <Stop offset="1" stopColor="#0B1020" stopOpacity={to} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={1} height={1} fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * Full-bleed photo with a slow "Ken Burns" drift (zoom + pan). Motion stops under reduce-motion.
 */
export function KenBurns({
  source, height, children, style, focus = 'center', scrim = true, scrimTop = 0.25, scrimBottom = 0.75,
}: {
  source: ImageProps['source']; height: number; children?: ReactNode; style?: StyleProp<ViewStyle>;
  focus?: ImageProps['contentPosition']; scrim?: boolean; scrimTop?: number; scrimBottom?: number;
}) {
  const zoom = useOscillate(24000);
  const a = useAnimatedStyle(() => ({
    transform: [{ scale: 1.1 + zoom.value * 0.06 }, { translateX: zoom.value * -14 }, { translateY: zoom.value * -6 }],
  }));
  return (
    <View style={[{ height, overflow: 'hidden' }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, a]}>
        <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={focus} transition={600} priority="high" />
      </Animated.View>
      {scrim && <Scrim top={scrimTop} to={scrimBottom} />}
      {children}
    </View>
  );
}

/** Photo that eases in on load and zooms gently while `active` (hover / press). */
export function ZoomPhoto({ source, active, style }: { source: ImageProps['source']; active: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <Animated.View
        style={[StyleSheet.absoluteFill, {
          transform: [{ scale: active ? 1.07 : 1 }],
          transitionProperty: 'transform',
          transitionDuration: 600,
          transitionTimingFunction: 'ease-out',
        }]}>
        <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} />
      </Animated.View>
    </View>
  );
}

import { Image, type ImageProps } from 'expo-image';
import { useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useOscillate } from './motion';
import { useTheme } from '@/hooks/use-theme';

export type VehicleKind = 'scooter' | 'motorbike' | 'car';

/** Real photos used until a manager uploads the vehicle's own photos (see assets/images/stock/CREDITS.md). */
export const StockPhotos = {
  hero: require('@/assets/images/stock/hero.jpg'),
  male: require('@/assets/images/stock/male.jpg'),
  scooter: require('@/assets/images/stock/scooter.jpg'),
  motorbike: require('@/assets/images/stock/motorbike.jpg'),
  car: require('@/assets/images/stock/car.jpg'),
} as const;

/** Whole bike cut out of its background, shown uncropped on a plain surface (see CREDITS.md). */
const Cutouts: Partial<Record<VehicleKind, ImageProps['source']>> = {
  scooter: require('@/assets/images/stock/scooter-cutout.webp'),
  motorbike: require('@/assets/images/stock/motorbike-cutout.webp'),
};

/** Showroom cut-outs of specific models, used instead of uploaded photos (see CREDITS.md). */
/**
 * Showroom cut-outs of specific models. `variants` are the same photo with the body panels
 * repainted in another colour (generated from the original; see CREDITS.md).
 */
const ModelCutouts: { match: RegExp; source: ImageProps['source']; credit: string; colour: string; variants: Partial<Record<string, ImageProps['source']>> }[] = [
  { match: /air\s*blade/i, source: require('@/assets/images/stock/airblade-cutout.webp'), credit: 'Airblade photo: Dmitry Makeev, Wikimedia Commons, CC BY-SA 4.0', colour: 'red', variants: {
    black: require('@/assets/images/stock/colours/airblade-black.webp'),
    blue: require('@/assets/images/stock/colours/airblade-blue.webp'),
    brown: require('@/assets/images/stock/colours/airblade-brown.webp'),
    green: require('@/assets/images/stock/colours/airblade-green.webp'),
    grey: require('@/assets/images/stock/colours/airblade-grey.webp'),
    orange: require('@/assets/images/stock/colours/airblade-orange.webp'),
    silver: require('@/assets/images/stock/colours/airblade-silver.webp'),
    white: require('@/assets/images/stock/colours/airblade-white.webp'),
    yellow: require('@/assets/images/stock/colours/airblade-yellow.webp'),
  } },
  { match: /\bpcx\b/i, source: require('@/assets/images/stock/pcx-cutout.webp'), credit: 'PCX photo: Chanokchon, Wikimedia Commons, CC BY-SA 4.0', colour: 'grey', variants: {
    black: require('@/assets/images/stock/colours/pcx-black.webp'),
    blue: require('@/assets/images/stock/colours/pcx-blue.webp'),
    brown: require('@/assets/images/stock/colours/pcx-brown.webp'),
    green: require('@/assets/images/stock/colours/pcx-green.webp'),
    orange: require('@/assets/images/stock/colours/pcx-orange.webp'),
    red: require('@/assets/images/stock/colours/pcx-red.webp'),
    silver: require('@/assets/images/stock/colours/pcx-silver.webp'),
    yellow: require('@/assets/images/stock/colours/pcx-yellow.webp'),
  } },
];

type BikeLike = { photos?: string[] | null; kind?: VehicleKind | null; make?: string | null; model?: string | null; colour?: string | null };

/** Uploaded PNG/WebP photos are treated as cut-outs (transparent background) and shown whole. */
export const isCutout = (uri?: string | null) => !!uri && /\.(png|webp)(\?|$)/i.test(uri);

/** Model cut-outs are Honda photos, so match the make too (an unknown make never gets a Honda picture). */
const modelCutout = (v: BikeLike) =>
  /honda/i.test(v.make ?? '') ? ModelCutouts.find((m) => m.match.test(v.model ?? '')) : undefined;
/** Colour of the bike in the model showroom picture, when that picture is what's shown (else null). */
export const stockPhotoColour = (v: BikeLike) => {
  const own = (v.photos ?? []).find(Boolean);
  if (own && isCutout(own)) return null;
  const model = modelCutout(v);
  if (!model) return null;
  return v.colour && model.variants[v.colour] ? v.colour : model.colour;
};
/** Photo credit to show when a model cut-out is on screen. */
export const bikeCredit = (v: BikeLike) => {
  const own = (v.photos ?? []).find(Boolean);
  return own && isCutout(own) ? null : modelCutout(v)?.credit ?? null;
};

/**
 * The picture to use for a bike and whether it is a whole-bike cut-out (shown uncropped).
 * Order: an uploaded cut-out, a showroom cut-out of the model, an uploaded photo, the stock picture for its type.
 */
export function bikeSource(v: BikeLike): { source: ImageProps['source']; cutout: boolean } {
  const own = (v.photos ?? []).find(Boolean);
  if (own && isCutout(own)) return { source: { uri: own }, cutout: true };
  const model = modelCutout(v);
  if (model) return { source: (v.colour && model.variants[v.colour]) || model.source, cutout: true };
  if (own) return { source: { uri: own }, cutout: false };
  const kind = v.kind ?? 'scooter';
  const cut = Cutouts[kind];
  return cut ? { source: cut, cutout: true } : { source: StockPhotos[kind], cutout: false };
}
/** True when the bike will be shown as a whole cut-out. */
export const showsCutout = (v: BikeLike) => bikeSource(v).cutout;

/**
 * The bike's picture. Uploaded photos fill the frame; until there is one, the stock bike is shown
 * whole (never cropped) on a plain surface with a soft floor shadow, like a showroom shot.
 */
export function BikeImage({ vehicle, style, faded, surface, fit = 'cover' }: {
  vehicle: BikeLike; style?: StyleProp<ViewStyle>; faded?: boolean; surface?: string; fit?: 'cover' | 'contain';
}) {
  const t = useTheme();
  const { source, cutout } = bikeSource(vehicle);
  if (!cutout) {
    return (
      <View style={[{ overflow: 'hidden' }, style, faded && { opacity: 0.55 }]}>
        <Image source={source} style={StyleSheet.absoluteFill} contentFit={fit} transition={300} alt={[vehicle.make, vehicle.model].filter(Boolean).join(' ')} />
      </View>
    );
  }
  return (
    <View style={[styles.stage, { backgroundColor: surface ?? t.backgroundSelected }, style, faded && { opacity: 0.55 }]}>
      <View style={styles.floor} />
      <Image source={source} style={styles.cutout} contentFit="contain" transition={300} accessibilityIgnoresInvertColors alt={[vehicle.make, vehicle.model].filter(Boolean).join(' ')} />
    </View>
  );
}

export function vehiclePhotos(v: BikeLike): ImageProps['source'][] {
  const own = (v.photos ?? []).filter(Boolean);
  return own.length ? own.map((uri) => ({ uri })) : [StockPhotos[v.kind ?? 'scooter']];
}

const styles = StyleSheet.create({
  stage: { overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end' },
  floor: { position: 'absolute', bottom: '7%', width: '66%', height: '9%', borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.14)' },
  cutout: { width: '86%', height: '84%', marginBottom: '6%' },
});

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
        <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={focus} transition={600} priority="high" alt="" />
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
        <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} alt="" />
      </Animated.View>
    </View>
  );
}

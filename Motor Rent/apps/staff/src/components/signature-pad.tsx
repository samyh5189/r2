import { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

const INK = '#111827';
const r = (n: number) => Math.round(n * 10) / 10;

/** Serialises strokes to the exact SVG format submit-inspection accepts. */
export function signatureSvg(strokes: string[], w: number, h: number) {
  const W = Math.max(10, Math.round(w));
  const H = Math.max(10, Math.round(h));
  const paths = strokes.map((d) =>
    `<path d="${d}" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${paths}</svg>`;
}

/**
 * Finger / mouse signature. Calls onChange with the SVG (or null when cleared / too short to be a signature).
 */
export function SignaturePad({ label, onChange }: { label: string; onChange: (svg: string | null) => void }) {
  const t = useTheme();
  const [strokes, setStrokes] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const size = useRef({ w: 320, h: 160 });
  const cur = useRef('');
  const points = useRef(0);
  const all = useRef<string[]>([]);

  const emit = () => {
    const total = all.current.join(' ').split(/[ML]/).length;
    onChange(total >= 12 ? signatureSvg(all.current, size.current.w, size.current.h) : null);
  };

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false, // keep the ScrollView from stealing the stroke
    onPanResponderGrant: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      cur.current = `M${r(x)} ${r(y)}`;
      points.current = 1;
      setCurrent(cur.current);
    },
    onPanResponderMove: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      if (x < 0 || y < 0 || x > size.current.w || y > size.current.h) return;
      cur.current += ` L${r(x)} ${r(y)}`;
      points.current += 1;
      setCurrent(cur.current);
    },
    onPanResponderRelease: () => {
      if (points.current > 1) {
        all.current = [...all.current, cur.current];
        setStrokes(all.current);
        emit();
      }
      cur.current = '';
      setCurrent('');
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  function clear() {
    all.current = [];
    setStrokes([]);
    onChange(null);
  }

  const onLayout = (e: LayoutChangeEvent) => {
    size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
  };

  const signed = strokes.length > 0;
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.head}>
        <ThemedText type="smallBold">{label}</ThemedText>
        {signed && (
          <Pressable onPress={clear} accessibilityRole="button" accessibilityLabel={`Clear ${label}`} hitSlop={10}>
            <ThemedText type="small" style={{ color: t.accent }}>Clear</ThemedText>
          </Pressable>
        )}
      </View>
      <View onLayout={onLayout} {...responder.panHandlers}
        accessibilityLabel={`${label} pad. Sign with your finger.`}
        style={[styles.pad, { borderColor: signed ? t.success : t.border }]}>
        <Svg width="100%" height="100%">
          {strokes.map((d, i) => <Path key={i} d={d} fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />)}
          {!!current && <Path d={current} fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
        </Svg>
        {!signed && !current && (
          <View pointerEvents="none" style={styles.hint}>
            <ThemedText type="small" style={{ color: '#9CA3AF' }}>Sign here</ThemedText>
          </View>
        )}
        <View pointerEvents="none" style={styles.line} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pad: { height: 170, borderRadius: 14, borderWidth: 2, backgroundColor: '#FFFFFF', overflow: 'hidden', touchAction: 'none', cursor: 'crosshair' } as object,
  hint: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  line: { position: 'absolute', left: 20, right: 20, bottom: 36, height: 1, backgroundColor: '#D1D5DB' },
});

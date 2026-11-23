import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { TopNavInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';
import { shadow } from './ui';

const TRIGGER = 70; // px of (damped) pull needed to refresh
const MAX = 120;


/**
 * Pull-to-refresh for the web build (React Native's RefreshControl does nothing in browsers).
 * Pass `attach` as the `ref` of a ScrollView / FlatList and render `indicator` next to it. No-op on iOS/Android,
 * where RefreshControl already handles this.
 */
export function useWebPullToRefresh(onRefresh: () => Promise<unknown> | void) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const cb = useRef(onRefresh);
  useEffect(() => { cb.current = onRefresh; }, [onRefresh]);
  const busy = useRef(false);

  // Typed loosely so it fits ScrollView and FlatList refs alike; on web both expose getScrollableNode().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attach = useCallback((r: any) => {
    if (Platform.OS !== 'web') return;
    const el = typeof r?.getScrollableNode === 'function' ? r.getScrollableNode() : r;
    setNode(el && typeof el.addEventListener === 'function' ? (el as HTMLElement) : null);
  }, []);

  useEffect(() => {
    if (!node) return;
    let startY: number | null = null;
    let dist = 0;
    const content = () => node.firstElementChild as HTMLElement | null;
    const move = (px: number, animate: boolean) => {
      const c = content();
      if (c) { c.style.transition = animate ? 'transform 220ms ease' : 'none'; c.style.transform = px ? `translateY(${px}px)` : ''; }
      setPull(px);
    };
    const onStart = (e: TouchEvent) => {
      startY = !busy.current && node.scrollTop <= 0 && e.touches.length === 1 ? e.touches[0]!.clientY : null;
      dist = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (startY === null) return;
      const dy = e.touches[0]!.clientY - startY;
      if (dy <= 0 || node.scrollTop > 0) { if (dist) move(0, false); startY = dy <= 0 ? startY : null; dist = 0; return; }
      dist = Math.min(MAX, dy * 0.5);
      if (e.cancelable) e.preventDefault(); // stop the page from rubber-banding while we pull
      move(dist, false);
    };
    const onEnd = async () => {
      if (startY === null) return;
      startY = null;
      if (dist < TRIGGER) return move(0, true);
      busy.current = true;
      setRefreshing(true);
      move(56, true);
      try { await cb.current(); } finally {
        busy.current = false;
        setRefreshing(false);
        move(0, true);
      }
    };
    node.style.overscrollBehaviorY = 'contain';
    node.addEventListener('touchstart', onStart, { passive: true });
    node.addEventListener('touchmove', onMove, { passive: false });
    node.addEventListener('touchend', onEnd);
    node.addEventListener('touchcancel', onEnd);
    return () => {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onEnd);
    };
  }, [node]);

  const indicator = Platform.OS === 'web' && (pull > 0 || refreshing)
    ? <PullIndicator progress={Math.min(1, pull / TRIGGER)} refreshing={refreshing} offset={pull} />
    : null;
  return { attach, indicator };
}

function PullIndicator({ progress, refreshing, offset }: { progress: number; refreshing: boolean; offset: number }) {
  const t = useTheme();
  const ready = progress >= 1;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: TopNavInset + Math.max(0, offset - 44) }]}>
      <View style={[styles.bubble, { backgroundColor: t.backgroundElement, borderColor: t.border, opacity: Math.max(0.3, progress) }, shadow(t.shadow, 1, 12)]}>
        {refreshing ? <ActivityIndicator color={t.accent} size="small" /> : (
          <ThemedText type="heading" style={{ color: ready ? t.accent : t.textSecondary, fontSize: 18, lineHeight: 20, transform: [{ rotate: `${ready ? 180 : progress * 180}deg` }] }}>↓</ThemedText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 5 },
  bubble: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});

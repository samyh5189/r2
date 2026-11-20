import { useEffect } from 'react';
import {
  cancelAnimation,
  Easing,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/** A value that loops linearly from `from` to `to` forever (e.g. scrolling road, spinning wheel). */
export function useLoop(duration: number, from = 0, to = 1, running = true) {
  const reduce = useReducedMotion();
  const v = useSharedValue(from);
  useEffect(() => {
    if (reduce || !running || duration <= 0) {
      cancelAnimation(v);
      return;
    }
    v.value = from;
    v.value = withRepeat(withTiming(to, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(v);
  }, [reduce, running, duration, from, to, v]);
  return v;
}

/** A value that eases back and forth between -1 and 1 (bobbing, breathing). */
export function useOscillate(duration: number, running = true) {
  const reduce = useReducedMotion();
  const v = useSharedValue(0);
  useEffect(() => {
    if (reduce || !running) {
      cancelAnimation(v);
      v.value = withTiming(0, { duration: 200 });
      return;
    }
    const ease = Easing.inOut(Easing.sin);
    v.value = withRepeat(
      withSequence(withTiming(1, { duration: duration / 2, easing: ease }), withTiming(-1, { duration: duration / 2, easing: ease })),
      -1,
      true,
    );
    return () => cancelAnimation(v);
  }, [reduce, running, duration, v]);
  return v;
}

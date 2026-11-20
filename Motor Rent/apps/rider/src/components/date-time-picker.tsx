import { useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';
import { PressableScale } from './ui';

/** Counter hours for pickups and returns (local time). */
export const OPEN_HOUR = 7;
export const CLOSE_HOUR = 22;
const SLOT_MINUTES = 30;

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();

/** All bookable slots on `day` at or after `min`. */
export function slotsFor(day: Date, min: Date): Date[] {
  const out: Date[] = [];
  for (let m = OPEN_HOUR * 60; m <= CLOSE_HOUR * 60; m += SLOT_MINUTES) {
    const s = startOfDay(day);
    s.setMinutes(m);
    if (s >= min) out.push(s);
  }
  return out;
}

/** First bookable slot at or after `min`. */
export function firstSlot(min: Date): Date {
  for (let i = 0; i < 60; i++) {
    const day = new Date(startOfDay(min).getTime() + i * 86_400_000);
    const s = slotsFor(day, min)[0];
    if (s) return s;
  }
  return min;
}

/** Day chips (scrollable) + 30-minute time chips within opening hours. */
export function DateTimePicker({ value, onChange, min, days = 30, label }: {
  value: Date; onChange: (d: Date) => void; min: Date; days?: number; label: string;
}) {
  const t = useTheme();
  const dayList = useMemo(() => {
    const first = startOfDay(min);
    return Array.from({ length: days }, (_, i) => new Date(first.getTime() + i * 86_400_000))
      .filter((d) => slotsFor(d, min).length > 0);
  }, [min, days]);
  const times = useMemo(() => slotsFor(value, min), [value, min]);
  const timeScroll = useRef<ScrollViewInstance>(null);
  const selectedIdx = times.findIndex((s) => s.getTime() === value.getTime());

  useEffect(() => {
    if (selectedIdx > 2) timeScroll.current?.scrollTo({ x: (selectedIdx - 2) * 84, animated: true });
  }, [selectedIdx]);

  function pickDay(d: Date) {
    // Keep the same clock time on the new day if possible, otherwise the first free slot.
    const wanted = new Date(d);
    wanted.setHours(value.getHours(), value.getMinutes(), 0, 0);
    const slots = slotsFor(d, min);
    onChange(slots.find((s) => s.getTime() === wanted.getTime()) ?? slots.find((s) => s >= wanted) ?? slots[0]!);
  }

  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const dayName = (d: Date) => sameDay(d, today) ? 'Today' : sameDay(d, tomorrow) ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short' });

  return (
    <View style={{ gap: Spacing.two }}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {dayList.map((d) => {
          const sel = sameDay(d, value);
          return (
            <PressableScale key={d.toDateString()} onPress={() => pickDay(d)} accessibilityRole="radio" accessibilityState={{ selected: sel }}
              accessibilityLabel={d.toDateString()} scaleTo={0.93} lift={false}
              style={[styles.day, { borderColor: sel ? t.accent : t.border, backgroundColor: sel ? t.accent : t.backgroundElement }]}>
              <ThemedText type="small" style={{ color: sel ? t.accentText : t.textSecondary, fontSize: 12 }}>{dayName(d)}</ThemedText>
              <ThemedText type="heading" style={{ color: sel ? t.accentText : t.text, fontSize: 20, lineHeight: 24 }}>{d.getDate()}</ThemedText>
              <ThemedText type="small" style={{ color: sel ? t.accentText : t.textSecondary, fontSize: 11 }}>{d.toLocaleDateString(undefined, { month: 'short' })}</ThemedText>
            </PressableScale>
          );
        })}
      </ScrollView>
      <ScrollView ref={timeScroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {times.map((s) => {
          const sel = s.getTime() === value.getTime();
          return (
            <PressableScale key={s.getTime()} onPress={() => onChange(s)} accessibilityRole="radio" accessibilityState={{ selected: sel }}
              scaleTo={0.93} lift={false}
              style={[styles.time, { borderColor: sel ? t.accent : t.border, backgroundColor: sel ? t.accentSoft : t.backgroundElement }]}>
              <ThemedText type="smallBold" style={{ color: sel ? t.accent : t.text, fontVariant: ['tabular-nums'] }}>
                {s.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </ThemedText>
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.two, paddingVertical: 2, paddingRight: Spacing.three },
  day: { width: 66, borderWidth: 1.5, borderRadius: Radius.md, paddingVertical: Spacing.two, alignItems: 'center', gap: 0 },
  time: { width: 76, minHeight: 44, borderWidth: 1.5, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
});

import { useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addDays, fmtDayMonth, fmtTime, fmtWeekday, mvDayStart, mvMinutes, sameMvDay } from '@/lib/mvtime';

import { ThemedText } from './themed-text';
import { PressableScale } from './ui';

/** Counter hours for pickups and returns (Maldives time). Keep in sync with the quote function. */
export const OPEN_HOUR = 7;
export const CLOSE_HOUR = 22;
const SLOT_MINUTES = 30;


/** All bookable slots on `day` at or after `min`. */
export function slotsFor(day: Date, min: Date): Date[] {
  const out: Date[] = [];
  for (let m = OPEN_HOUR * 60; m <= CLOSE_HOUR * 60; m += SLOT_MINUTES) {
    const s = new Date(mvDayStart(day).getTime() + m * 60_000);
    if (s >= min) out.push(s);
  }
  return out;
}

/** First bookable slot at or after `min`. */
export function firstSlot(min: Date): Date {
  for (let i = 0; i < 60; i++) {
    const day = addDays(mvDayStart(min), i);
    const s = slotsFor(day, min)[0];
    if (s) return s;
  }
  return min;
}

/** Day chips (scrollable) + 30-minute time chips within opening hours. */
export function DateTimePicker({ value, onChange, min, days = 30, label }: {
  value: Date; onChange: (d: Date) => void; min: Date; days?: number; label?: string;
}) {
  const t = useTheme();
  const dayList = useMemo(() => {
    const first = mvDayStart(min);
    return Array.from({ length: days }, (_, i) => addDays(first, i))
      .filter((d) => slotsFor(d, min).length > 0);
  }, [min, days]);
  const times = useMemo(() => slotsFor(value, min), [value, min]);
  const timeScroll = useRef<ScrollViewInstance>(null);
  const selectedIdx = times.findIndex((s) => s.getTime() === value.getTime());

  useEffect(() => {
    if (selectedIdx > 2) timeScroll.current?.scrollTo({ x: (selectedIdx - 2) * 70, animated: true });
  }, [selectedIdx]);

  function pickDay(d: Date) {
    // Keep the same clock time on the new day if possible, otherwise the first free slot.
    const wanted = new Date(mvDayStart(d).getTime() + mvMinutes(value) * 60_000);
    const slots = slotsFor(d, min);
    onChange(slots.find((s) => s.getTime() === wanted.getTime()) ?? slots.find((s) => s >= wanted) ?? slots[0]!);
  }

  const today = new Date();
  const tomorrow = addDays(today, 1);
  const dayName = (d: Date) => sameMvDay(d, today) ? 'Today' : sameMvDay(d, tomorrow) ? 'Tomorrow' : fmtWeekday(d);

  return (
    <View style={{ gap: Spacing.two }}>
      {label && <ThemedText type="smallBold">{label}</ThemedText>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {dayList.map((d) => {
          const sel = sameMvDay(d, value);
          return (
            <PressableScale key={d.getTime()} onPress={() => pickDay(d)} accessibilityRole="radio" accessibilityState={{ selected: sel }}
              accessibilityLabel={`${fmtWeekday(d, 'long')} ${fmtDayMonth(d)}`} scaleTo={0.93} lift={false}
              style={[styles.day, { borderColor: sel ? t.accent : t.border, backgroundColor: sel ? t.accent : t.backgroundElement }]}>
              <ThemedText type="small" style={{ color: sel ? t.accentText : t.textSecondary, fontSize: 11, lineHeight: 14 }}>{dayName(d)}</ThemedText>
              <ThemedText type="heading" style={{ color: sel ? t.accentText : t.text, fontSize: 17, lineHeight: 20 }}>{fmtDayMonth(d)}</ThemedText>
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
              style={[styles.time, { borderColor: sel ? t.accent : t.border, backgroundColor: sel ? t.accent : t.backgroundElement }]}>
              <ThemedText type="smallBold" style={{ color: sel ? t.accentText : t.text, fontVariant: ['tabular-nums'] }}>
                {fmtTime(s)}
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
  day: { minWidth: 72, borderWidth: 1.5, borderRadius: Radius.sm, paddingVertical: 6, paddingHorizontal: Spacing.two, alignItems: 'center' },
  time: { width: 62, minHeight: 40, borderWidth: 1.5, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
});

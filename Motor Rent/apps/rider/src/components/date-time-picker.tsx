import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

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

/**
 * Day chips (scrollable) + 30-minute time chips within opening hours.
 * With `onCommit` it works one tap at a time: tap a day, then its times appear; tapping a time commits.
 */
export function DateTimePicker({ value, onChange, min, days = 30, label, onCommit }: {
  value: Date; onChange: (d: Date) => void; min: Date; days?: number; label?: string; onCommit?: (d: Date) => void;
}) {
  if (onCommit) return <TapThrough value={value} min={min} days={days} onCommit={onCommit} />;
  return <Classic value={value} onChange={onChange} min={min} days={days} label={label} />;
}

function Classic({ value, onChange, min, days, label }: { value: Date; onChange: (d: Date) => void; min: Date; days: number; label?: string }) {
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

/** One question at a time: pick a day (it stays highlighted), then a time on that day, which commits. */
function TapThrough({ value, min, days, onCommit }: { value: Date; min: Date; days: number; onCommit: (d: Date) => void }) {
  const t = useTheme();
  const [day, setDay] = useState<Date | null>(null);
  const dayList = useMemo(() => {
    const first = mvDayStart(min);
    return Array.from({ length: days }, (_, i) => addDays(first, i)).filter((d) => slotsFor(d, min).length > 0);
  }, [min, days]);
  const today = new Date();
  const tomorrow = addDays(today, 1);
  const dayName = (d: Date) => sameMvDay(d, today) ? 'Today' : sameMvDay(d, tomorrow) ? 'Tomorrow' : fmtWeekday(d);

  if (!day) return <DaySwiper days={dayList} value={value} dayName={dayName} onPick={setDay} />;
  const times = slotsFor(day, min);
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ gap: Spacing.three }}>
      <View style={styles.dayHead}>
        <ThemedText type="heading">{dayName(day)}, {fmtDayMonth(day)}</ThemedText>
        <Pressable onPress={() => setDay(null)} accessibilityRole="button" hitSlop={8}>
          <ThemedText type="smallBold" themeColor="accent">Change day</ThemedText>
        </Pressable>
      </View>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {times.map((s) => {
          const sel = s.getTime() === value.getTime();
          return (
            <PressableScale key={s.getTime()} onPress={() => onCommit(s)} accessibilityRole="radio" accessibilityState={{ selected: sel }}
              scaleTo={0.93} lift={false}
              style={[styles.timeCard, { borderColor: sel ? t.accent : t.border, backgroundColor: sel ? t.accent : t.backgroundElement }]}>
              <ThemedText type="smallBold" style={{ color: sel ? t.accentText : t.text, fontVariant: ['tabular-nums'], fontSize: 16 }}>{fmtTime(s)}</ThemedText>
            </PressableScale>
          );
        })}
      </View>
    </Animated.View>
  );
}

/** Day cards in a swipeable row that snaps card by card (like the fleet showcase); arrows on wider screens. */
function DaySwiper({ days, value, dayName, onPick }: { days: Date[]; value: Date; dayName: (d: Date) => string; onPick: (d: Date) => void }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const [boxW, setBoxW] = useState(0);
  const per = width >= 900 ? 7 : width >= 640 ? 5 : 4;
  const gap = Spacing.two;
  const cardW = boxW ? (boxW - gap * (per - 1)) / per : 80;
  const step = cardW + gap;
  const ref = useRef<ScrollViewInstance>(null);
  const [first, setFirst] = useState(0);
  const selected = Math.max(0, days.findIndex((d) => sameMvDay(d, value)));
  const last = Math.max(0, days.length - per);
  const go = (i: number) => ref.current?.scrollTo({ x: Math.max(0, Math.min(last, i)) * step, animated: true });
  // Start with the chosen day in view.
  useEffect(() => {
    if (!boxW) return;
    const id = setTimeout(() => ref.current?.scrollTo({ x: Math.min(last, Math.max(0, selected - 1)) * step, animated: false }), 0);
    return () => clearTimeout(id);
  }, [boxW, selected, last, step]);
  const month = days[first] ? days[first].toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Indian/Maldives' }) : '';
  return (
    <View style={{ gap: Spacing.two }} onLayout={(e) => setBoxW(e.nativeEvent.layout.width)}>
      <View style={styles.dayHead}>
        <ThemedText type="smallBold" themeColor="textSecondary">{month}</ThemedText>
        {width >= 640 && (
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            <SwipeArrow label="Earlier days" disabled={first === 0} onPress={() => go(first - per)}>‹</SwipeArrow>
            <SwipeArrow label="Later days" disabled={first >= last} onPress={() => go(first + per)}>›</SwipeArrow>
          </View>
        )}
      </View>
      <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} snapToInterval={step} decelerationRate="fast"
        scrollEventThrottle={32} onScroll={(e) => setFirst(Math.round(e.nativeEvent.contentOffset.x / step))}
        contentContainerStyle={{ gap }} style={Platform.OS === 'web' ? ({ scrollSnapType: 'x mandatory' } as object) : undefined}
        accessibilityRole="radiogroup">
        {days.map((d) => {
          const sel = sameMvDay(d, value);
          return (
            <PressableScale key={d.getTime()} onPress={() => onPick(d)} accessibilityRole="radio" accessibilityState={{ selected: sel }}
              accessibilityLabel={`${fmtWeekday(d, 'long')} ${fmtDayMonth(d)}`} scaleTo={0.93} lift={false}
              style={[styles.swipeCard, { width: cardW, borderColor: sel ? t.accent : t.border, backgroundColor: t.backgroundElement },
                Platform.OS === 'web' && ({ scrollSnapAlign: 'start' } as object)]}>
              <ThemedText type="small" style={{ color: sel ? t.accent : t.textSecondary, fontSize: 12, lineHeight: 15 }}>{dayName(d)}</ThemedText>
              <ThemedText type="heading" style={{ fontSize: 24, lineHeight: 28 }}>{d.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Indian/Maldives' })}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12, lineHeight: 15 }}>{d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'Indian/Maldives' })}</ThemedText>
            </PressableScale>
          );
        })}
      </ScrollView>
      <ThemedText type="small" themeColor="textSecondary">Swipe for more days.</ThemedText>
    </View>
  );
}

function SwipeArrow({ label, disabled, onPress, children }: { label: string; disabled: boolean; onPress: () => void; children: string }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={[styles.arrow, { borderColor: t.border, opacity: disabled ? 0.35 : 1 }]}>
      <ThemedText style={{ fontSize: 22, lineHeight: 24 }}>{children}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.two, paddingVertical: 2, paddingRight: Spacing.three },
  day: { minWidth: 72, borderWidth: 1.5, borderRadius: Radius.sm, paddingVertical: 6, paddingHorizontal: Spacing.two, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  swipeCard: { borderWidth: 1.5, borderRadius: Radius.md, paddingVertical: Spacing.three, alignItems: 'center', gap: 2 },
  arrow: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dayCard: { width: 96, borderWidth: 1.5, borderRadius: Radius.sm, paddingVertical: Spacing.two, alignItems: 'center' },
  timeCard: { width: 76, minHeight: 46, borderWidth: 1.5, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.two },
  time: { width: 62, minHeight: 40, borderWidth: 1.5, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
});

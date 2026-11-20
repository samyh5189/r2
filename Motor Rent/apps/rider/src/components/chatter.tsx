import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { STAGE } from '@/lib/booking-status';

import { Avatar } from './avatar';
import { ThemedText } from './themed-text';
import { Button, ErrorText } from './ui';

/** One entry of the booking history: a message from either side, or a logged change (status, payment…). */
export type ChatterItem = {
  key: string;
  at: Date;
  who: { name: string; avatar?: string | null; mark?: string; staff: boolean; me: boolean };
} & (
  | { kind: 'message'; body: string }
  | { kind: 'status'; from: string | null; to: string; note?: string | null }
  | { kind: 'log'; text: string; tone?: 'success' | 'danger' | 'neutral'; note?: string | null }
);

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
function dayLabel(d: Date) {
  const now = new Date();
  if (sameDay(d, now)) return 'Today';
  if (sameDay(d, new Date(now.getTime() - 86_400_000))) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
function timeLabel(d: Date) {
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Odoo-style chatter: composer on top, then the history newest-first, grouped by day,
 * with messages and logged changes (status arrows, payments) on one timeline.
 */
export function Chatter({ items, onSend, placeholder }: {
  items: ChatterItem[]; onSend: (body: string) => Promise<void>; placeholder?: string;
}) {
  const t = useTheme();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setSending(true); setError(null);
    try { await onSend(body); setDraft(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not send.'); } finally { setSending(false); }
  }

  const sorted = [...items].sort((a, b) => b.at.getTime() - a.at.getTime());
  const groups: { day: string; items: ChatterItem[] }[] = [];
  for (const it of sorted) {
    const label = dayLabel(it.at);
    if (groups.at(-1)?.day === label) groups.at(-1)!.items.push(it); else groups.push({ day: label, items: [it] });
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <View style={{ gap: Spacing.two }}>
        <TextInput
          value={draft} onChangeText={setDraft} multiline maxLength={2000} editable={!sending}
          placeholder={placeholder ?? 'Send a message to the office…'} placeholderTextColor={t.textSecondary}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onKeyPress={(e) => {
            const ne = e.nativeEvent as unknown as { key: string; metaKey?: boolean; ctrlKey?: boolean };
            if (Platform.OS === 'web' && ne.key === 'Enter' && (ne.metaKey || ne.ctrlKey)) send();
          }}
          style={[styles.input, { color: t.text, backgroundColor: t.backgroundElement, borderColor: focused ? t.accent : t.border },
            Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
        />
        <View style={styles.composerRow}>
          <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
            {Platform.OS === 'web' ? 'Ctrl/⌘ + Enter to send · ' : ''}The office usually replies within an hour.
          </ThemedText>
          <View style={{ minWidth: 110 }}>
            <Button title="Send" onPress={send} loading={sending} disabled={!draft.trim()} />
          </View>
        </View>
        <ErrorText>{error}</ErrorText>
      </View>

      {groups.map((g) => (
        <View key={g.day} style={{ gap: Spacing.three }}>
          <View style={styles.dayRow}>
            <View style={[styles.rule, { backgroundColor: t.border }]} />
            <ThemedText type="smallBold" themeColor="textSecondary" style={{ fontSize: 12 }}>{g.day}</ThemedText>
            <View style={[styles.rule, { backgroundColor: t.border }]} />
          </View>
          {g.items.map((it) => <Entry key={it.key} it={it} />)}
        </View>
      ))}
      {!items.length && <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>No activity yet.</ThemedText>}
    </View>
  );
}

function Entry({ it }: { it: ChatterItem }) {
  const t = useTheme();
  const name = it.who.me ? 'You' : it.who.name;
  return (
    <Animated.View layout={LinearTransition} style={styles.entry}>
      <Avatar path={it.who.avatar} name={it.who.name} mark={it.who.mark} size={36} color={it.who.staff ? t.text : undefined} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.head}>
          <ThemedText type="smallBold">{name}</ThemedText>
          {it.who.staff && !it.who.mark && <ThemedText type="small" style={[styles.badge, { color: t.accent, backgroundColor: t.accentSoft }]}>Office</ThemedText>}
          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>· {timeLabel(it.at)}</ThemedText>
        </View>
        {it.kind === 'message' && (
          <View style={[styles.bubble, { backgroundColor: it.who.staff ? t.accentSoft : t.backgroundElement, borderColor: t.border }]}>
            <ThemedText selectable>{it.body}</ThemedText>
          </View>
        )}
        {it.kind === 'status' && (
          <View style={{ gap: 2 }}>
            <View style={styles.change}>
              <View style={[styles.dot, { backgroundColor: t.textSecondary }]} />
              {it.from ? (
                <ThemedText type="small"><ThemedText type="small" themeColor="textSecondary">{STAGE[it.from] ?? it.from}</ThemedText>  →  <ThemedText type="smallBold" style={{ color: t.accent }}>{STAGE[it.to] ?? it.to}</ThemedText>  <ThemedText type="small" themeColor="textSecondary">(Status)</ThemedText></ThemedText>
              ) : (
                <ThemedText type="small">Booking created · <ThemedText type="smallBold" style={{ color: t.accent }}>{STAGE[it.to] ?? it.to}</ThemedText></ThemedText>
              )}
            </View>
            {it.note ? <ThemedText type="small" themeColor="textSecondary" style={{ paddingLeft: 14 }}>“{it.note}”</ThemedText> : null}
          </View>
        )}
        {it.kind === 'log' && (
          <View style={{ gap: 2 }}>
            <View style={styles.change}>
              <View style={[styles.dot, { backgroundColor: it.tone === 'success' ? t.success : it.tone === 'danger' ? t.danger : t.textSecondary }]} />
              <ThemedText type="small">{it.text}</ThemedText>
            </View>
            {it.note ? <ThemedText type="small" themeColor="textSecondary" style={{ paddingLeft: 14 }}>“{it.note}”</ThemedText> : null}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 80, maxHeight: 200, borderWidth: 1.5, borderRadius: Radius.md, padding: Spacing.three, fontSize: 16, textAlignVertical: 'top' },
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rule: { flex: 1, height: 1 },
  entry: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  badge: { fontSize: 11, lineHeight: 14, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: 'hidden' },
  bubble: { borderWidth: 1, borderRadius: 14, borderTopLeftRadius: 4, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, alignSelf: 'flex-start', maxWidth: '100%' },
  change: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});

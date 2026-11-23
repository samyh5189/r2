import { useWindowDimensions, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Page, PageHead, pageStyles, Reveal } from './page-kit';
import { ThemedText } from './themed-text';

/** Rental terms and privacy policy: numbered sections that reveal as you read down. */
export function LegalPage({ title, lead, sections }: { title: string; lead: string; sections: { title: string; body: string[] }[] }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  return (
    <Page underHeader={false} cta={false}>
      <PageHead title={title} lead={lead} />
      <View style={{ marginTop: Spacing.six, maxWidth: 860 }}>
        {sections.map((s, i) => (
          <Reveal key={s.title} onView delay={i < 3 ? 120 + i * 60 : 0}
            style={[{ borderTopWidth: 1, borderColor: t.border, paddingVertical: Spacing.four, gap: Spacing.two }, wide && { flexDirection: 'row', gap: Spacing.five }]}>
            <View style={[{ flexDirection: 'row', gap: Spacing.three, alignItems: 'baseline' }, wide && { width: 260 }]}>
              <ThemedText style={[pageStyles.kicker, { color: t.accent }]}>{String(i + 1).padStart(2, '0')}</ThemedText>
              <ThemedText style={[pageStyles.display, { fontSize: 21, lineHeight: 26, color: t.text, flexShrink: 1 }]}>{s.title}</ThemedText>
            </View>
            <View style={{ flex: 1, gap: Spacing.two }}>
              {s.body.map((p) => <ThemedText key={p} themeColor="textSecondary" style={{ fontSize: 16, lineHeight: 25 }}>{p}</ThemedText>)}
            </View>
          </Reveal>
        ))}
      </View>
    </Page>
  );
}

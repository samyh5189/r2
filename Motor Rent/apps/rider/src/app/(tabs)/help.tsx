import { Linking, useWindowDimensions, View } from 'react-native';

import { ArrowLink, OpenNow, Page, PageHead, Panel, pageStyles, Question, Reveal, whatsappUrl } from '@/components/page-kit';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { FAQ } from '@/lib/faq';
import { useSiteSettings } from '@/lib/site';

/** Common questions, each opening in place, and how to reach us. */
export default function HelpScreen() {
  const t = useTheme();
  const site = useSiteSettings();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const phone = site?.support_phone;
  return (
    <Page>
      <PageHead title="Good to know." lead="Short answers about renting, paying and riding. The rental terms have the full detail." />
      <View style={[{ marginTop: Spacing.six, gap: Spacing.three }, wide && { flexDirection: 'row', alignItems: 'flex-start' }]}>
        <Reveal delay={120} style={wide ? { flex: 1.6 } : undefined}>
          <Panel style={{ paddingVertical: Spacing.one }}>
            {FAQ.map((f, i) => <Question key={f.q} q={f.q} a={f.a} first={i === 0} defaultOpen={i === 0} />)}
          </Panel>
        </Reveal>
        <Reveal delay={220} style={wide ? { flex: 1 } : undefined}>
          <Panel tone="soft" style={{ gap: Spacing.three }}>
            <ThemedText style={[pageStyles.display, { fontSize: 26, lineHeight: 30, letterSpacing: -0.8, color: t.text }]}>Still unsure?</ThemedText>
            <ThemedText themeColor="textSecondary" style={{ fontSize: 16, lineHeight: 24 }}>
              Come by the counter, or message us from your rental once you’ve booked.
            </ThemedText>
            <OpenNow />
            {phone && <ArrowLink label="Message us on WhatsApp" onPress={() => Linking.openURL(whatsappUrl(phone))} />}
            <ArrowLink label="Find our counter" href="/counter" />
            <ArrowLink label="Read the rental terms" href="/terms" />
          </Panel>
        </Reveal>
      </View>
    </Page>
  );
}

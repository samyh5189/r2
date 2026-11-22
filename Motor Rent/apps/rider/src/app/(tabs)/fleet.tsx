import { ActivityIndicator, View } from 'react-native';

import { ModelGrid, useModels } from '@/components/fleet-cards';
import { Page, PageHead } from '@/components/page-kit';
import { bikeCredit } from '@/components/photo';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Each model in the fleet shown whole, with its day price. Tapping one starts a booking with it. */
export default function FleetScreen() {
  const t = useTheme();
  const models = useModels();
  const credits = [...new Set((models ?? []).map((m) => bikeCredit(m.first)).filter(Boolean))] as string[];
  return (
    <Page>
      <PageHead title="Pick your bike." lead="Scooters and motorbikes by the hour or the day, from our counter in Kulhudhuffushi. Helmets on request." />
      {!models ? <ActivityIndicator color={t.accent} style={{ marginVertical: Spacing.six }} /> : (
        <ModelGrid models={models} style={{ marginTop: Spacing.six }} />
      )}
      {models && models.length > 0 && (
        <View style={{ marginTop: Spacing.three }}>
          <ThemedText type="small" themeColor="textSecondary">Colours and plates depend on which bike is free for your times.</ThemedText>
          {credits.map((c) => <ThemedText key={c} type="small" themeColor="textSecondary" style={{ fontSize: 11, lineHeight: 15, opacity: 0.8 }}>{c}</ThemedText>)}
        </View>
      )}
    </Page>
  );
}

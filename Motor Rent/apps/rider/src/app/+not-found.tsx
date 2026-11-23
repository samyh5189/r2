import { router } from 'expo-router';
import { View } from 'react-native';

import { ArrowLink, Page, PageHead } from '@/components/page-kit';
import { SiteHeader } from '@/components/site-nav';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';

/** Unknown address: say so plainly and point to the main pages. */
export default function NotFound() {
  return (
    <View style={{ flex: 1 }}>
      <Page cta={false}>
        <PageHead kicker="Page not found" title="Wrong turn." lead="That page doesn’t exist, or it has moved. Here’s where you can go instead." />
        <View style={{ marginTop: Spacing.five, gap: Spacing.two, alignItems: 'flex-start' }}>
          <View style={{ minWidth: 230 }}><Button title="Book a ride" onPress={() => router.replace('/book')} /></View>
          <ArrowLink label="See the fleet" href="/fleet" />
          <ArrowLink label="Prices" href="/prices" />
          <ArrowLink label="Home" onPress={() => router.replace('/')} />
        </View>
      </Page>
      <SiteHeader floating />
    </View>
  );
}

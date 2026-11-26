import { Stack } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';

import { SiteHeader } from '@/components/site-nav';
import { TabBar } from '@/components/tab-bar';

/** Main pages (home, fleet, my account, my rentals) share the floating header; phones also get a bottom tab bar. */
export default function MainLayout() {
  const { width } = useWindowDimensions();
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
        <SiteHeader floating />
      </View>
      {width < 900 && <TabBar />}
    </View>
  );
}

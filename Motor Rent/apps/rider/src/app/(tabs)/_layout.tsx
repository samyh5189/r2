import { Stack } from 'expo-router';
import { View } from 'react-native';

import { SiteHeader } from '@/components/site-nav';

/** Main pages (home, fleet, my account, my rentals) share the floating header with the side menu. */
export default function MainLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
      <SiteHeader floating />
    </View>
  );
}

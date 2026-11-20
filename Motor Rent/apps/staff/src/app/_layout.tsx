import { DarkTheme, DefaultTheme, Redirect, Stack, ThemeProvider, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { supabaseConfigured } from '@/lib/supabase';
import { SessionProvider, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

function Gate() {
  const { session, loading } = useSession();
  const segments = useSegments();
  if (!loading && !session && segments[0] !== 'sign-in') return <Redirect href="/sign-in" />;
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Find booking' }} />
      <Stack.Screen name="booking/[ref]" options={{ title: 'Booking' }} />
      <Stack.Screen name="inspection/[id]" options={{ title: 'Inspection' }} />
      <Stack.Screen name="sign-in" options={{ title: 'Staff sign in' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  if (!supabaseConfigured) {
    SplashScreen.hideAsync();
    return (
      <View style={notice.wrap}>
        <Text style={notice.text}>Backend not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then rebuild.</Text>
      </View>
    );
  }
  return (
    <SessionProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <Gate />
      </ThemeProvider>
    </SessionProvider>
  );
}

const notice = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  text: { fontSize: 16, textAlign: 'center', color: '#111', maxWidth: 420 },
});

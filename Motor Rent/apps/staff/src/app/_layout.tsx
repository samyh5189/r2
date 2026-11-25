import { DarkTheme, DefaultTheme, Redirect, Stack, ThemeProvider, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

import { Colors } from '@/constants/theme';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { supabaseConfigured } from '@/lib/supabase';
import { SessionProvider, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

function Gate() {
  const { session, loading } = useSession();
  const segments = useSegments();
  const c = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  if (!loading && !session && segments[0] !== 'sign-in') return <Redirect href="/sign-in" />;
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: c.background }, headerShadowVisible: false, headerTintColor: c.text,
      headerTitleStyle: { fontWeight: '700' }, contentStyle: { backgroundColor: c.background },
    }}>
      <Stack.Screen name="index" options={{ title: 'Find booking', headerShown: false }} />
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
      <ThemeProvider value={colorScheme === 'dark'
        ? { ...DarkTheme, colors: { ...DarkTheme.colors, primary: Colors.dark.accent, background: Colors.dark.background, card: Colors.dark.background, border: Colors.dark.border } }
        : { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: Colors.light.accent, background: Colors.light.background, card: Colors.light.background, border: Colors.light.border } }}>
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

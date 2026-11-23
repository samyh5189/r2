import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { webHeaderOption } from '@/components/web-header';
import { WebMeta } from '@/components/web-meta';
import { Colors, Fonts } from '@/constants/theme';
import { supabaseConfigured } from '@/lib/supabase';
import { SessionProvider } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

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
  const dark = colorScheme === 'dark';
  const c = Colors[dark ? 'dark' : 'light'];
  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, primary: c.accent, background: c.background, card: c.background, text: c.text, border: c.border },
  };
  return (
    <SessionProvider>
      <ThemeProvider value={navTheme}>
        <AnimatedSplashOverlay />
        <WebMeta />
        <Stack screenOptions={{
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: Fonts?.display, fontWeight: '700' },
          contentStyle: { backgroundColor: c.background },
          animation: 'slide_from_right',
        }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="book" options={{ title: 'Book a ride', headerBackTitle: 'Fleet', ...webHeaderOption }} />
          <Stack.Screen name="bike/[id]" options={{ title: 'Book a ride', headerBackTitle: 'Fleet', ...webHeaderOption }} />
          <Stack.Screen name="sign-in" options={{ title: 'Sign in', presentation: 'modal', ...webHeaderOption }} />
          <Stack.Screen name="verify" options={{ title: 'Verify your identity', ...webHeaderOption }} />
          <Stack.Screen name="booking/[id]" options={{ title: 'Rental', headerBackTitle: 'Rentals', ...webHeaderOption }} />
          <Stack.Screen name="terms" options={{ title: 'Rental terms', ...webHeaderOption }} />
          <Stack.Screen name="privacy" options={{ title: 'Privacy policy', ...webHeaderOption }} />
          <Stack.Screen name="reset-password" options={{ title: 'New password', ...webHeaderOption }} />
          <Stack.Screen name="+not-found" options={{ headerShown: false }} />
        </Stack>
      </ThemeProvider>
    </SessionProvider>
  );
}

const notice = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  text: { fontSize: 16, textAlign: 'center', color: '#111', maxWidth: 420 },
});

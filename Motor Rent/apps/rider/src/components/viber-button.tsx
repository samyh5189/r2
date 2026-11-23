import { Linking, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableScale } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSiteSettings } from '@/lib/site';

const VIBER = '#7360F2';

/**
 * Opens the EasyRide Viber bot with this booking's private code. In the chat the rider taps
 * "Send my booking details" and then gets updates there. Hidden until the bot is connected in the admin.
 */
export function ViberButton({ code }: { code?: string | null }) {
  const t = useTheme();
  const site = useSiteSettings();
  if (!code || !site?.viber_ready || !site.viber_uri) return null;
  const url = `viber://pa?chatURI=${encodeURIComponent(site.viber_uri)}&context=${code}`;
  return (
    <View style={{ gap: Spacing.one }}>
      <PressableScale onPress={() => Linking.openURL(url)} accessibilityRole="link" accessibilityLabel="Get the booking details on Viber"
        style={[styles.btn, { backgroundColor: VIBER }]}>
        <ThemedText type="smallBold" style={{ color: '#FFFFFF', fontSize: 16 }}>Get the details on Viber</ThemedText>
      </PressableScale>
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', color: t.textSecondary }}>
        Opens our Viber chat. Tap “Send my booking details” there and we’ll message you updates.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { minHeight: 50, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.three },
});

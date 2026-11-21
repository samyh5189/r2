import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { TERMS, TERMS_UPDATED, TERMS_VERSION } from '@/lib/terms';

export default function TermsScreen() {
  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.body}>
          <ThemedText type="subtitle">Rental terms</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Updated {TERMS_UPDATED} (version {TERMS_VERSION})</ThemedText>
          {TERMS.map((s) => (
            <View key={s.title} style={styles.section}>
              <ThemedText type="heading">{s.title}</ThemedText>
              {s.body.map((p) => <ThemedText key={p}>{p}</ThemedText>)}
            </View>
          ))}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingBottom: Spacing.six },
  body: { padding: Spacing.four, gap: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  section: { gap: Spacing.two },
});

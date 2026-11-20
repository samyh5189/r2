import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, ErrorText } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dateTime, money, parseRange } from '@/lib/format';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Row = {
  id: string; reference: string; status: string; period: string; total: number; currency: 'MVR' | 'USD';
  vehicles: { make: string; model: string; plate: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  held: 'Awaiting payment', confirmed: 'Confirmed', active: 'On the road', overdue: 'Overdue — please return',
  returned: 'Returned', damage_claim: 'Damage review', closed: 'Completed', expired: 'Expired', cancelled: 'Cancelled',
};

export default function BookingsScreen() {
  const { session } = useSession();
  const t = useTheme();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('bookings')
      .select('id, reference, status, period, total, currency, vehicles(make, model, plate)')
      .order('created_at', { ascending: false })
      .limit(50);
    setError(error ? 'Could not load your rentals.' : null);
    setRows((data as unknown as Row[]) ?? []);
    setLoading(false);
  }, [session]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!session) {
    return (
      <ThemedView style={[styles.flex, styles.center]}>
        <ThemedText>Sign in to see your rentals.</ThemedText>
        <Button title="Sign in" onPress={() => router.push('/sign-in')} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          ListHeaderComponent={<View style={{ gap: Spacing.one }}><ThemedText type="subtitle">My rentals</ThemedText><ErrorText>{error}</ErrorText></View>}
          ListEmptyComponent={!loading ? <ThemedText themeColor="textSecondary">No rentals yet.</ThemedText> : undefined}
          renderItem={({ item }) => {
            const r = parseRange(item.period);
            const alert = item.status === 'overdue' || item.status === 'held';
            return (
              <Card>
                <View style={styles.line}>
                  <ThemedText type="smallBold" style={{ fontSize: 17 }}>{item.vehicles?.make} {item.vehicles?.model}</ThemedText>
                  <ThemedText type="small" style={{ color: alert ? t.danger : t.textSecondary }}>{STATUS_LABEL[item.status] ?? item.status}</ThemedText>
                </View>
                {r && <ThemedText type="small">{dateTime(r.start)} → {dateTime(r.end)}</ThemedText>}
                <View style={styles.line}>
                  <ThemedText type="small" themeColor="textSecondary" selectable>Ref {item.reference} · {item.vehicles?.plate}</ThemedText>
                  <ThemedText type="small">{money(item.total, item.currency)}</ThemedText>
                </View>
              </Card>
            );
          }}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  list: { padding: Spacing.three, paddingBottom: BottomTabInset + Spacing.four, gap: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
});

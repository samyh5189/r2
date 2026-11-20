import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card, ErrorText } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { money } from '@/lib/format';
import { supabase } from '@/lib/supabase';

type Bike = {
  id: string;
  make: string;
  model: string;
  engine_cc: number | null;
  photos: string[];
  branches: { name: string } | null;
  price_plans: { hourly: number; daily: number; currency: 'MVR' | 'USD' } | null;
};

export default function BikesScreen() {
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vehicles')
      .select('id, make, model, engine_cc, photos, branches(name), price_plans(hourly, daily, currency)')
      .eq('status', 'active')
      .order('make');
    setError(error ? 'Could not load bikes. Pull to retry.' : null);
    setBikes((data as unknown as Bike[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <FlatList
          data={bikes}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          ListHeaderComponent={
            <View style={{ gap: Spacing.one, marginBottom: Spacing.two }}>
              <ThemedText type="subtitle">Rent a bike</ThemedText>
              <ThemedText themeColor="textSecondary">Pick a bike, choose your time, ride.</ThemedText>
              <ErrorText>{error}</ErrorText>
            </View>
          }
          ListEmptyComponent={!loading && !error ? <ThemedText themeColor="textSecondary">No bikes available right now.</ThemedText> : undefined}
          renderItem={({ item }) => (
            <Link href={{ pathname: '/bike/[id]', params: { id: item.id } }} asChild>
              <Pressable accessibilityRole="button" accessibilityLabel={`${item.make} ${item.model}`}>
                <Card style={styles.row}>
                  {item.photos[0] ? (
                    <Image source={item.photos[0]} style={styles.photo} contentFit="cover" />
                  ) : (
                    <View style={[styles.photo, styles.placeholder]} />
                  )}
                  <View style={styles.flex}>
                    <ThemedText type="smallBold" style={{ fontSize: 17 }}>{item.make} {item.model}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.engine_cc ? `${item.engine_cc} cc · ` : ''}{item.branches?.name}
                    </ThemedText>
                    {item.price_plans && (
                      <ThemedText type="small">
                        {money(item.price_plans.hourly, item.price_plans.currency)}/h · {money(item.price_plans.daily, item.price_plans.currency)}/day
                      </ThemedText>
                    )}
                  </View>
                </Card>
              </Pressable>
            </Link>
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: Spacing.three, paddingBottom: BottomTabInset + Spacing.four, gap: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  photo: { width: 88, height: 72, borderRadius: 12 },
  placeholder: { backgroundColor: '#8884' },
});

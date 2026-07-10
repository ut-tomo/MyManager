import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { initializeDatabase } from './src/db/client';
import { scheduleWeeklyReflectionPrompt, scheduleWeeklyReviewReadyPrompt } from './src/services/notifications';
import { syncNow } from './src/services/sync';
import type { Tab } from './src/navigation';
import { HomeScreen } from './src/screens/HomeScreen';
import { ManageScreen } from './src/screens/ManageScreen';
import { MealScreen } from './src/screens/MealScreen';
import { ReviewScreen } from './src/screens/ReviewScreen';
import { WeightScreen } from './src/screens/WeightScreen';
import { WorkoutScreen } from './src/screens/WorkoutScreen';
import { colors } from './src/theme';

const TABS: Array<{ key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap; iconActive: keyof typeof Ionicons.glyphMap }> = [
  { key: 'home', label: 'ホーム', icon: 'home-outline', iconActive: 'home' },
  { key: 'workout', label: '筋トレ', icon: 'barbell-outline', iconActive: 'barbell' },
  { key: 'meal', label: '食事', icon: 'restaurant-outline', iconActive: 'restaurant' },
  { key: 'weight', label: '体重', icon: 'scale-outline', iconActive: 'scale' },
  { key: 'review', label: 'レビュー', icon: 'sparkles-outline', iconActive: 'sparkles' },
  { key: 'settings', label: '設定', icon: 'settings-outline', iconActive: 'settings' }
];

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

function Root() {
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [refreshKey, setRefreshKey] = useState(0);
  const lastForegroundSync = useRef(Date.now());

  useEffect(() => {
    initializeDatabase()
      .then(() => {
        setReady(true);
        // 起動時に静かに同期（Supabase未設定・オフラインなら何もしない。記録はローカル優先）
        syncNow().then(() => setRefreshKey((key) => key + 1)).catch(() => null);
      })
      .catch((error) => Alert.alert('データベースエラー', String(error)));
    // 日曜20:00「今週の感想を書きませんか？」/ 22:05「レビュー確認」通知（権限がなければ静かに無視）
    scheduleWeeklyReflectionPrompt().catch(() => null);
    scheduleWeeklyReviewReadyPrompt().catch(() => null);
  }, []);

  // バックグラウンドから復帰したとき（例: ジムで記録→帰宅後に開く）にも静かに同期する。
  // 頻発しないよう5分間隔に間引く。
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (Date.now() - lastForegroundSync.current < 5 * 60 * 1000) return;
      lastForegroundSync.current = Date.now();
      syncNow().then(() => setRefreshKey((key) => key + 1)).catch(() => null);
    });
    return () => sub.remove();
  }, []);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  function renderScreen() {
    if (!ready) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }
    switch (tab) {
      case 'workout':
        return <WorkoutScreen refresh={refresh} refreshKey={refreshKey} />;
      case 'meal':
        return <MealScreen refresh={refresh} refreshKey={refreshKey} />;
      case 'weight':
        return <WeightScreen refresh={refresh} refreshKey={refreshKey} />;
      case 'review':
        return <ReviewScreen refreshKey={refreshKey} />;
      case 'settings':
        return <ManageScreen refresh={refresh} />;
      case 'home':
      default:
        return <HomeScreen go={setTab} refreshKey={refreshKey} refresh={refresh} />;
    }
  }

  return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <StatusBar style="light" />
        <View style={styles.app}>{renderScreen()}</View>
        {/* Androidのジェスチャーバーと重ならないよう下インセットを反映 */}
        <View style={[styles.tabbar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          {TABS.map((item) => {
            const activeTab = tab === item.key;
            return (
              <Pressable
                key={item.key}
                style={styles.tab}
                onPress={() => {
                  setTab(item.key);
                  refresh();
                }}
              >
                <Ionicons name={activeTab ? item.iconActive : item.icon} size={21} color={activeTab ? colors.tabActive : colors.tabInactive} />
                <Text style={[styles.tabText, activeTab && styles.tabTextActive]} numberOfLines={1}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  app: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabbar: {
    flexDirection: 'row',
    backgroundColor: colors.tabBg,
    borderTopWidth: 1,
    borderTopColor: colors.tabBorder,
    paddingTop: 9,
    paddingHorizontal: 2
  },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  tabText: { fontSize: 10, color: colors.tabInactive, fontWeight: '700' },
  tabTextActive: { color: colors.tabActive }
});

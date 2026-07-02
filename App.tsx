import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { initializeDatabase } from './src/db/client';
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
  { key: 'review', label: 'レビュー', icon: 'sparkles-outline', iconActive: 'sparkles' }
];

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [manageOpen, setManageOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    initializeDatabase()
      .then(() => setReady(true))
      .catch((error) => Alert.alert('データベースエラー', String(error)));
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
    if (manageOpen) {
      return <ManageScreen close={() => setManageOpen(false)} refresh={refresh} />;
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
      case 'home':
      default:
        return <HomeScreen go={setTab} openManage={() => setManageOpen(true)} refreshKey={refreshKey} refresh={refresh} />;
    }
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        <View style={styles.app}>{renderScreen()}</View>
        {!manageOpen ? (
          <View style={styles.tabbar}>
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
                  <Ionicons name={activeTab ? item.iconActive : item.icon} size={22} color={activeTab ? colors.primary : colors.faint} />
                  <Text style={[styles.tabText, activeTab && styles.tabTextActive]} numberOfLines={1}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  app: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabbar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    paddingBottom: 22,
    paddingHorizontal: 6
  },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  tabText: { fontSize: 10, color: colors.faint, fontWeight: '700' },
  tabTextActive: { color: colors.primary }
});

import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false
  })
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const next = await Notifications.requestPermissionsAsync();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT
    });
  }
  return next.granted;
}

export async function scheduleWeeklyReflectionPrompt(): Promise<string | null> {
  const granted = await requestNotificationPermission();
  if (!granted) return null;
  return Notifications.scheduleNotificationAsync({
    content: {
      title: '今週の感想を書きませんか？',
      body: '週次レビューに渡すメモを短く残しておけます。'
    },
    trigger: { weekday: 1, hour: 20, minute: 0, repeats: true } as any
  });
}

export async function scheduleWorkoutCheckoutReminder(minutes = 180): Promise<string | null> {
  const granted = await requestNotificationPermission();
  if (!granted) return null;
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'ジムを出ましたか？',
      body: '退館時間を記録するとワークアウト時間を自動集計できます。'
    },
    trigger: { seconds: minutes * 60, repeats: false } as any
  });
}

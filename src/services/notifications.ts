import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// SDK 53以降、Expo Goは通知機能を持たない（importしただけでERRORが出る）。
// Expo Goでは通知を丸ごと無効化し、開発ビルド/APKでのみ遅延ロードする。
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type NotificationsModule = typeof import('expo-notifications');
let cached: NotificationsModule | null = null;

function getNotifications(): NotificationsModule | null {
  if (isExpoGo) return null;
  if (!cached) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require('expo-notifications') as NotificationsModule;
    cached.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false
      })
    });
  }
  return cached;
}

// Androidはチャンネルがないと通知が表示されない。権限の有無に関わらず先に作る。
async function ensureAndroidChannel(N: NotificationsModule): Promise<void> {
  if (Platform.OS !== 'android') return;
  await N.setNotificationChannelAsync('default', {
    name: 'default',
    importance: N.AndroidImportance.DEFAULT
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  const N = getNotifications();
  if (!N || !Device.isDevice) return false;
  await ensureAndroidChannel(N);
  const current = await N.getPermissionsAsync();
  if (current.granted) return true;
  const next = await N.requestPermissionsAsync();
  return next.granted;
}

const REFLECTION_PROMPT_TITLE = '今週の感想を書きませんか？';

// 日曜20:00の感想リマインド。多重登録を防ぐため、既に予約済みなら何もしない。
export async function scheduleWeeklyReflectionPrompt(): Promise<string | null> {
  const N = getNotifications();
  if (!N) return null;
  const granted = await requestNotificationPermission();
  if (!granted) return null;
  const scheduled = await N.getAllScheduledNotificationsAsync();
  if (scheduled.some((n) => n.content.title === REFLECTION_PROMPT_TITLE)) return null;
  return N.scheduleNotificationAsync({
    content: {
      title: REFLECTION_PROMPT_TITLE,
      body: '週次レビューに渡すメモを短く残しておけます。'
    },
    trigger: {
      type: N.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 1, // 1 = 日曜
      hour: 20,
      minute: 0
    }
  });
}

const REVIEW_READY_TITLE = '週次レビューが届いているはずです';

// 日曜22:05: サーバー側の自動生成（22:00）の後に確認を促す。多重登録は防止。
export async function scheduleWeeklyReviewReadyPrompt(): Promise<string | null> {
  const N = getNotifications();
  if (!N) return null;
  const granted = await requestNotificationPermission();
  if (!granted) return null;
  const scheduled = await N.getAllScheduledNotificationsAsync();
  if (scheduled.some((n) => n.content.title === REVIEW_READY_TITLE)) return null;
  return N.scheduleNotificationAsync({
    content: {
      title: REVIEW_READY_TITLE,
      body: 'アプリを開くと今週のフィードバックが同期されます。'
    },
    trigger: {
      type: N.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 1,
      hour: 22,
      minute: 5
    }
  });
}

const CHECKOUT_TITLE = 'ジムを出ましたか？';

// セッション開始から一定時間後の「終了ボタン押し忘れ」リマインド
export async function scheduleWorkoutCheckoutReminder(minutes = 180): Promise<string | null> {
  const N = getNotifications();
  if (!N) return null;
  const granted = await requestNotificationPermission();
  if (!granted) return null;
  await cancelWorkoutCheckoutReminder();
  return N.scheduleNotificationAsync({
    content: {
      title: CHECKOUT_TITLE,
      body: '退館時間を記録するとワークアウト時間を自動集計できます。'
    },
    trigger: {
      type: N.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: minutes * 60,
      repeats: false
    }
  });
}

// セッション終了時に呼んで、不要になったリマインドを消す
export async function cancelWorkoutCheckoutReminder(): Promise<void> {
  const N = getNotifications();
  if (!N) return;
  const scheduled = await N.getAllScheduledNotificationsAsync();
  for (const item of scheduled) {
    if (item.content.title === CHECKOUT_TITLE) {
      await N.cancelScheduledNotificationAsync(item.identifier);
    }
  }
}

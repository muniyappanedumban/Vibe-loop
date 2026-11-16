// Push notifications: registers this device with the server when the admin turns `push` on.
// Android standalone builds need Firebase (FCM) credentials in the app config; without them we say so instead of failing silently.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { call } from './api';
import { feature } from './config';

export type PushState = { ok: boolean; message: string };
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true } as any) });
export async function registerPush(): Promise<PushState> {
  if (!feature('push')) return { ok: false, message: 'Push is switched off by VibeLoop' };
  if (Platform.OS === 'web') return { ok: false, message: 'Push works in the mobile app' };
  try {
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: 'Messages & activity', importance: Notifications.AndroidImportance.HIGH });
    const perm = await Notifications.requestPermissionsAsync(); if (!perm.granted) return { ok: false, message: 'Notifications are off for VibeLoop in system settings' };
    let token: string | null = null; let provider = 'expo';
    try { token = (await Notifications.getExpoPushTokenAsync()).data; } catch { try { token = (await Notifications.getDevicePushTokenAsync()).data as string; provider = 'fcm'; } catch {} }
    if (!token) return { ok: false, message: 'This build has no push credentials (Firebase/EAS project) yet — notifications will start once they are added' };
    await call('POST', '/push/token', { token, platform: Platform.OS, provider });
    return { ok: true, message: 'Push notifications are on' };
  } catch (e: any) { return { ok: false, message: e?.message ?? 'Could not register for push' }; }
}

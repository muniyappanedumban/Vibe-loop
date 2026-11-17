import React, { useEffect, useState } from 'react';
import { Platform, View, AppState, Text, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { C } from './src/theme/tokens';
import { CC } from './src/chat/theme';
import { TabBar } from './src/navigation/TabBar';
import { ChatTabBar } from './src/chat/ChatTabBar';
import { useStore } from './src/store/useStore';
import { useSession, loadToken, online, useGate, APP_VERSION } from './src/lib/api';
import { useConfig as useCfgGate, versionLt } from './src/lib/config';
import { refresh } from './src/lib/sync';
import { useConfig, loadConfig, navItems } from './src/lib/config';
import { chat } from './src/chat/useChat';
import { gate } from './src/components/Gate';
import { ChatBubble } from './src/components/ModuleSwitch';
import Onboarding from './src/screens/Onboarding';
import SignIn from './src/screens/SignIn';
import { Profile } from './src/screens/Money';
import CreatorHub from './src/screens/CreatorHub';
import { LoopsScreen, NewLoop, LoopDetail, FanReact, Archive } from './src/screens/Loops';
import { CreateHub, Copilot, Editor, Audio } from './src/screens/Create';
import { Library, Memory } from './src/screens/Library';
import { ReleaseGate, Earnings, Payout } from './src/screens/Payouts';
import { Features } from './src/screens/Catalog';
import { Learn } from './src/screens/LevelUp';
import { IconKitScreen } from './src/screens/IconKitScreen';
import { Live } from './src/screens/LiveLane';
import { Vault } from './src/screens/Keepers';
import { Explore } from './src/screens/Discover';
import { Notifications, Settings } from './src/screens/System';
import { Home, Motion, Sparks, NewPost } from './src/screens/Social';
import { Search } from './src/screens/Connect';
import { Emoji, Growth, Trust, SettingsHub } from './src/screens/Extras';
import { ChatList, ChatRoom, NewChat, ShareToChat, ChatSearch, Starred, LockGate } from './src/chat/screens/Chats';
import { useHushPrefs } from './src/chat/hushPrefs';
import { CallScreen, CallLog, LiveCamera, SnapView, FollowRequests, needs, startParity } from './src/chat/screens/Parity';
import { Friends, MyCode, Vibes, StatusCompose, StatusView, Towns, CreateTown, TownRoom } from './src/chat/screens/People';
import { Stash, BackstagePass, Props, CashFlow } from './src/screens/Money2';
import { OutboxScreen } from './src/screens/OutboxScreen';
import { EditProfile } from './src/screens/EditProfile';
import { Comments, LoveTrail, SaveStack, MoodDrop } from './src/screens/Micro';
import { ContentHub, PageView, Blog, SpeakUp, CreatorProfile, ProductView } from './src/screens/Hub';
import './src/lib/outbox';
import { ChatMe, ChangeHandle, ChatSecurity, LanguageRegion, BubbleMojiGallery, Accounts } from './src/chat/screens/Me';
import * as Hush from './src/chat/screens/HushSettings';

const Stack = createNativeStackNavigator();
const SocialTab = createBottomTabNavigator();
const ChatTab = createBottomTabNavigator();
export const navRef = createNavigationContainerRef<any>();

const SOCIAL_TABS: Record<string, React.ComponentType<any>> = { Home, Explore, Create: NewPost, Motion, Profile };
const CHAT_TABS: Record<string, React.ComponentType<any>> = { Chats: ChatList, Friends, Vibes, Towns, ChatMe };
// Stack screens: every one is wrapped by gate(key) so the server config can switch it off per country/zone/slab.
const STACK: Record<string, React.ComponentType<any>> = {
  HushSettings: needs('hushSettings', Hush.HushSettings), HushProfile: needs('hushSettings', Hush.HushProfile), HushPrivacy: needs('hushSettings', Hush.HushPrivacy), HushBlocked: needs('hushSettings', Hush.HushBlocked), HushNotifications: needs('hushSettings', Hush.HushNotifications), HushChats: needs('hushSettings', Hush.HushChats), HushArchive: needs('hushSettings', Hush.HushArchive), HushCalls: needs('hushSettings', Hush.HushCalls), HushSecurity: needs('hushSettings', Hush.HushSecurity), HushStorage: needs('hushSettings', Hush.HushStorage), HushAbout: needs('hushSettings', Hush.HushAbout),
  Notifications, Settings, Sparks, NewPost, Search, Emoji, Growth, Trust, SettingsHub,
  // Creator Studio & classic screens — restored; each can be switched off in Admin → Screen Switches.
  CreatorHub, Loops: LoopsScreen, NewLoop, LoopDetail, FanReact, Archive, CreateHub, Copilot, Editor, Audio, Library, Memory, ReleaseGate, Earnings, Payout, Features, Learn, IconKit: IconKitScreen, Live, Vault,
  Call: needs('calls', CallScreen), CallLog: needs('calls', CallLog), LiveCamera: needs('liveCamera', LiveCamera), SnapView: needs('snaps', SnapView), FollowRequests: needs('followRequests', FollowRequests),
  ChatRoom, NewChat, ShareToChat, ChatSearch, Starred, MyCode, StatusCompose, StatusView, CreateTown, TownRoom, ChangeHandle, ChatSecurity, LanguageRegion, BubbleMojiGallery, Accounts, Stash, BackstagePass, Props, CashFlow, Outbox: OutboxScreen, EditProfile, Comments, LoveTrail, SaveStack, MoodDrop, ContentHub, PageView, Blog, SpeakUp, CreatorProfile, ProductView,
};
function GateOverlay() {
  const net = useGate(); const acc = useCfgGate(s => s.cfg.access);
  const g = net.kind ? net : acc?.maintenance ? { kind: 'maintenance' as const, message: acc.maintenanceMessage || 'Down for maintenance' }
    : acc?.forceUpdate && acc.minAppVersion && versionLt(APP_VERSION, acc.minAppVersion) ? { kind: 'update' as const, message: `Update required — version ${acc.minAppVersion} or newer.` } : net;
  if (!g.kind) return null;
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#120F24', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
      <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900', textAlign: 'center' }}>{g.kind === 'update' ? 'Update required' : 'Back soon'}</Text>
      <Text style={{ color: 'rgba(255,255,255,.75)', fontSize: 15, textAlign: 'center', marginTop: 12, lineHeight: 22 }}>{g.message}</Text>
      <Pressable onPress={() => { useGate.setState({ kind: null, message: '' }); loadConfig().catch(() => {}); }} style={{ marginTop: 24, backgroundColor: '#C8F45A', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 999 }} accessibilityRole="button"><Text style={{ fontWeight: '900', color: '#0B0B12' }}>Try again</Text></Pressable>
    </View>
  );
}
export const STACK_SCREENS = Object.keys(STACK);
startParity(navRef as any);
const GATED = Object.fromEntries(Object.entries(STACK).map(([k, Comp]) => [k, gate(k, Comp)]));

function SocialTabs() {
  const cfg = useConfig(s => s.cfg); const items = navItems(cfg, 'social').filter(i => SOCIAL_TABS[i.key]);
  return (
    <View style={{ flex: 1 }}>
      <SocialTab.Navigator key={items.map(i => i.key).join()} tabBar={p => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bg } } as any}>
        {items.map(i => <SocialTab.Screen key={i.key} name={i.key} component={SOCIAL_TABS[i.key]} />)}
      </SocialTab.Navigator>
      {cfg.modules.chat && cfg.features.chatBubble !== false ? <ChatBubble /> : null}
    </View>
  );
}
function ChatTabs() {
  const cfg = useConfig(s => s.cfg); const items = navItems(cfg, 'chat').filter(i => CHAT_TABS[i.key]);
  useEffect(() => { chat.loadAll().catch(() => {}); const t = setInterval(() => { chat.refreshConvs().catch(() => {}); chat.pulse().catch(() => {}); }, 5000); return () => clearInterval(t); }, []);
  const lockOn = useHushPrefs(s => s.prefs.chatLock); const [unlocked, setUnlocked] = useState(false);
  useEffect(() => { useHushPrefs.getState().load(); }, []);
  if (lockOn && !unlocked) return <LockGate title="Hush" onOpen={() => setUnlocked(true)} />;  // Hush app-level chat lock
  return (
    <ChatTab.Navigator key={items.map(i => i.key).join()} tabBar={p => <ChatTabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: CC.bg } } as any}>
      {items.map(i => <ChatTab.Screen key={i.key} name={i.key} component={CHAT_TABS[i.key]} />)}
    </ChatTab.Navigator>
  );
}

const qs = () => (Platform.OS === 'web' && typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null);

export default function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const wait = (p: any) => (p.hasHydrated() ? Promise.resolve() : new Promise<void>(r => p.onFinishHydration(() => r())));
    Promise.all([wait(useStore.persist), wait(useSession.persist), wait(useConfig.persist), loadToken()]).then(() => { setReady(true); refresh(); loadConfig(); });
    const sub = AppState.addEventListener('change', s => { if (s === 'active') { loadConfig(); refresh(); } });
    const pulse = setInterval(() => { if (online()) chat.pulse().catch(() => {}); }, 15000);
    return () => { sub.remove(); clearInterval(pulse); };
  }, []);
  const mode = useSession(s => s.mode); const module = useSession(s => s.module); const modules = useConfig(s => s.cfg.modules);
  if (!ready) return <View style={{ flex: 1, backgroundColor: C.ink }} />;
  const q = qs(); const target = q?.get('s');
  const chatRoot = module === 'chat' && modules.chat !== false && mode === 'online';
  const root = chatRoot ? 'ChatMain' : 'Main';
  const initial = target === 'Onboarding' || target === 'SignIn' ? target : !target && mode === 'none' ? 'Onboarding' : root;
  const onReady = () => {
    if (!target || target === 'Onboarding' || target === 'SignIn') return;
    const params: any = {}; q?.forEach((v, k) => { if (k !== 's' && k !== 'm') params[k] = v; });
    if (SOCIAL_TABS[target]) navRef.navigate('Main', { screen: target });
    else if (CHAT_TABS[target]) navRef.navigate('ChatMain', { screen: target });
    else navRef.navigate(target, params);
  };
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer ref={navRef} onReady={onReady} theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: C.bg } }}>
        <Stack.Navigator initialRouteName={initial} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'slide_from_right' }}>
          <Stack.Screen name="Onboarding" component={Onboarding} />
          <Stack.Screen name="SignIn" component={SignIn} />
          <Stack.Screen name="Main" component={SocialTabs} options={{ animation: 'fade' }} />
          <Stack.Screen name="ChatMain" component={ChatTabs} options={{ animation: 'fade', contentStyle: { backgroundColor: CC.bg } }} />
          {Object.entries(GATED).map(([k, Comp]) => <Stack.Screen key={k} name={k} component={Comp} />)}
        </Stack.Navigator>
      </NavigationContainer>
      <GateOverlay />
    </SafeAreaProvider>
  );
}

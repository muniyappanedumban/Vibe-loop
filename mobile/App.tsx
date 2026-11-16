import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { C } from './src/theme/tokens';
import { TabBar } from './src/navigation/TabBar';
import { TAB_SCREENS } from './src/navigation/routes';
import { useStore } from './src/store/useStore';
import Onboarding from './src/screens/Onboarding';
import SignIn from './src/screens/SignIn';
import { useSession, loadToken } from './src/lib/api';
import { refresh } from './src/lib/sync';
import Home from './src/screens/Home';
import { LoopsScreen, NewLoop, LoopDetail, FanReact, Archive } from './src/screens/Loops';
import { CreateHub, Copilot, Editor, Audio } from './src/screens/Create';
import { Library, Memory } from './src/screens/Library';
import { ReleaseGate, Profile, Earnings, Payout } from './src/screens/Money';
import { Notifications, Settings } from './src/screens/System';
import { Explore, Motion, Sparks, NewPost, Vault } from './src/screens/Social';
import { Chats, ChatThread, Search, Tribes, Live } from './src/screens/Connect';
import { Emoji, Features, Growth, Trust, Learn, SettingsHub } from './src/screens/Extras';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
export const navRef = createNavigationContainerRef<any>();

function Tabs() {
  return (
    <Tab.Navigator tabBar={p => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bg } } as any}>
      <Tab.Screen name="Home" component={Home} />
      <Tab.Screen name="Explore" component={Explore} />
      <Tab.Screen name="Create" component={CreateHub} />
      <Tab.Screen name="Motion" component={Motion} />
      <Tab.Screen name="Profile" component={Profile} />
    </Tab.Navigator>
  );
}

const qs = () => (Platform.OS === 'web' && typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null);

export default function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const wait = (p: any) => (p.hasHydrated() ? Promise.resolve() : new Promise<void>(r => p.onFinishHydration(() => r())));
    Promise.all([wait(useStore.persist), wait(useSession.persist), loadToken()]).then(() => { setReady(true); refresh(); });
  }, []);
  const mode = useSession(s => s.mode);
  if (!ready) return <View style={{ flex: 1, backgroundColor: C.ink }} />;
  const q = qs(); const target = q?.get('s');
  const initial = target === 'Onboarding' || target === 'SignIn' ? target : !target && mode === 'none' ? 'Onboarding' : 'Main';
  const onReady = () => {
    if (!target || target === 'Onboarding' || target === 'SignIn') return;
    const params: any = {}; q?.forEach((v, k) => { if (k !== 's') params[k] = v; });
    if (TAB_SCREENS.includes(target)) navRef.navigate('Main', { screen: target }); else navRef.navigate(target, params);
  };
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer ref={navRef} onReady={onReady} theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: C.bg } }}>
        <Stack.Navigator initialRouteName={initial} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'slide_from_right' }}>
          <Stack.Screen name="Onboarding" component={Onboarding} />
          <Stack.Screen name="SignIn" component={SignIn} />
          <Stack.Screen name="Main" component={Tabs} />
          <Stack.Screen name="NewLoop" component={NewLoop} />
          <Stack.Screen name="LoopDetail" component={LoopDetail} />
          <Stack.Screen name="FanReact" component={FanReact} options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="Archive" component={Archive} />
          <Stack.Screen name="Copilot" component={Copilot} />
          <Stack.Screen name="Editor" component={Editor} />
          <Stack.Screen name="Audio" component={Audio} />
          <Stack.Screen name="Memory" component={Memory} />
          <Stack.Screen name="ReleaseGate" component={ReleaseGate} />
          <Stack.Screen name="Earnings" component={Earnings} />
          <Stack.Screen name="Payout" component={Payout} />
          <Stack.Screen name="Notifications" component={Notifications} />
          <Stack.Screen name="Settings" component={Settings} />
          <Stack.Screen name="Loops" component={LoopsScreen} />
          <Stack.Screen name="Library" component={Library} />
          <Stack.Screen name="Sparks" component={Sparks} />
          <Stack.Screen name="NewPost" component={NewPost} />
          <Stack.Screen name="Vault" component={Vault} />
          <Stack.Screen name="Chats" component={Chats} />
          <Stack.Screen name="ChatThread" component={ChatThread} />
          <Stack.Screen name="Search" component={Search} />
          <Stack.Screen name="Tribes" component={Tribes} />
          <Stack.Screen name="Live" component={Live} />
          <Stack.Screen name="Emoji" component={Emoji} />
          <Stack.Screen name="Features" component={Features} />
          <Stack.Screen name="Growth" component={Growth} />
          <Stack.Screen name="Trust" component={Trust} />
          <Stack.Screen name="Learn" component={Learn} />
          <Stack.Screen name="SettingsHub" component={SettingsHub} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

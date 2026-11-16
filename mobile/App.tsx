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
import Home from './src/screens/Home';
import { LoopsScreen, NewLoop, LoopDetail, FanReact, Archive } from './src/screens/Loops';
import { CreateHub, Copilot, Editor, Audio } from './src/screens/Create';
import { Library, Memory } from './src/screens/Library';
import { ReleaseGate, Profile, Earnings, Payout } from './src/screens/Money';
import { Notifications, Settings } from './src/screens/System';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
export const navRef = createNavigationContainerRef<any>();

function Tabs() {
  return (
    <Tab.Navigator tabBar={p => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bg } } as any}>
      <Tab.Screen name="Home" component={Home} />
      <Tab.Screen name="Loops" component={LoopsScreen} />
      <Tab.Screen name="Create" component={CreateHub} />
      <Tab.Screen name="Library" component={Library} />
      <Tab.Screen name="Profile" component={Profile} />
    </Tab.Navigator>
  );
}

const qs = () => (Platform.OS === 'web' && typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null);

export default function App() {
  const [ready, setReady] = useState(useStore.persist.hasHydrated());
  useEffect(() => useStore.persist.onFinishHydration(() => setReady(true)), []);
  useEffect(() => { if (useStore.persist.hasHydrated()) setReady(true); }, []);
  const onboarded = useStore(s => s.onboarded);
  if (!ready) return <View style={{ flex: 1, backgroundColor: C.ink }} />;
  const q = qs(); const target = q?.get('s');
  const initial = target === 'Onboarding' || (!target && !onboarded) ? 'Onboarding' : 'Main';
  const onReady = () => {
    if (!target || target === 'Onboarding') return;
    const params = q?.get('id') ? { id: q.get('id') } : undefined;
    if (TAB_SCREENS.includes(target)) navRef.navigate('Main', { screen: target }); else navRef.navigate(target, params);
  };
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer ref={navRef} onReady={onReady} theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: C.bg } }}>
        <Stack.Navigator initialRouteName={initial} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'slide_from_right' }}>
          <Stack.Screen name="Onboarding" component={Onboarding} />
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
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

// Wraps every stack screen: if the server config turns a screen off for this user's region/slab, show an honest notice.
import React from 'react';
import { View, Text } from 'react-native';
import { useConfig } from '../lib/config';
import { Screen, Header, Btn } from './UI';
import { Icon } from './Icon';
import { C, T } from '../theme/tokens';
export function gate(key: string, Comp: React.ComponentType<any>) {
  const Gated = (props: any) => {
    const on = useConfig(s => s.cfg.screens[key] !== false); const where = useConfig(s => s.cfg.resolvedFor);
    if (on) return <Comp {...props} />;
    return (
      <Screen>
        <Header title="Not available here" />
        <View style={{ alignItems: 'center', marginTop: 40, gap: 12 }}>
          <Icon name="globe" size={48} color={C.violet} />
          <Text style={[T.h2, { textAlign: 'center' }]}>This feature is turned off for your region</Text>
          <Text style={[T.small, { textAlign: 'center' }]}>Country {where.country} · zone {where.zone} · plan {where.slab}. VibeLoop controls availability per region; nothing is broken.</Text>
          <Btn kind="ghost" title="Go back" onPress={() => props.navigation.goBack()} />
        </View>
      </Screen>
    );
  };
  Gated.displayName = `Gate(${key})`;
  return Gated;
}

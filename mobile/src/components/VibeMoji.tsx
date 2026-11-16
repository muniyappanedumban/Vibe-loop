import React from 'react';
import { SvgXml } from 'react-native-svg';
import { vibemojiSvg } from '../lib/vibemoji';
export const VibeMoji = React.memo(function VibeMoji({ id, size = 32 }: { id: number; size?: number }) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  return <SvgXml xml={vibemojiSvg(id, uid)} width={size} height={size} />;
});

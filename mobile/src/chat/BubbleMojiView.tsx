import React from 'react';
import { SvgXml } from 'react-native-svg';
import { bubbleSvg } from './bubblemoji';
export const BubbleMoji = React.memo(function BubbleMoji({ id, size = 32 }: { id: number; size?: number }) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  return <SvgXml xml={bubbleSvg(id, uid)} width={size} height={size} />;
});

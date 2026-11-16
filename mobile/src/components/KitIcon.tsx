import React from 'react';
import { SvgXml } from 'react-native-svg';
import { kitSvg, Kit } from '../lib/iconkit';
export const KitIconView = React.memo(function KitIconView({ kit, id, size = 28 }: { kit: Kit; id: number; size?: number }) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  return <SvgXml xml={kitSvg(kit, id, uid)} width={size} height={size} />;
});

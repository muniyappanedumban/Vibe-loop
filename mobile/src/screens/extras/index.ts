// Registry of add-on batches 2–9: screens are spread into the stack; entries show up in Glow Extras / Hush Extras.
import * as B2 from './B2'; import * as B3 from './B3'; import * as B4 from './B4'; import * as B5 from './B5';
import * as B6 from './B6'; import * as B7 from './B7'; import * as B8 from './B8'; import * as B9 from './B9';
import * as B10 from './B10'; import * as B11 from './B11'; import * as B12 from './B12'; import * as B13 from './B13';
import * as B14 from './B14'; import * as B15 from './B15'; import * as B16 from './B16'; import * as B17 from './B17';
import type { AddonEntry } from './B2';
const ALL = [B2, B3, B4, B5, B6, B7, B8, B9, B10, B11, B12, B13, B14, B15, B16, B17];
export const ADDON_SCREENS = Object.assign({}, ...ALL.map(b => b.SCREENS));
export const ADDON_ENTRIES: AddonEntry[] = ALL.flatMap(b => b.ENTRIES);

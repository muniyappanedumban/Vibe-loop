import React, { useEffect, useState } from 'react';
import { registerRootComponent } from 'expo';
import { loadAppliedTheme, applyTheme } from './src/theme/applyTheme';

// Boot: apply the last server theme to the design tokens BEFORE any screen module (and its StyleSheets) loads.
function Boot() {
  const [App, setApp] = useState<React.ComponentType | null>(null);
  useEffect(() => { loadAppliedTheme().then(t => { applyTheme(t); setApp(() => require('./App').default); }); }, []);
  return App ? React.createElement(App) : null;
}
registerRootComponent(Boot);

'use client';

import { createContext, useContext, useEffect } from 'react';
import { useStoredValue } from '@/app/lib/useStoredValue';

const ThemeContext = createContext({ dark: false, toggle: () => {} });

export function ThemeProvider({ children }) {
  // Light until someone picks dark; remembered in this browser.
  const [theme, setTheme] = useStoredValue('faithsync-theme', 'light');
  const dark = theme === 'dark';

  // Tell the stylesheet too (scrollbars follow the theme, see globals.css).
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  function toggle() {
    setTheme(dark ? 'light' : 'dark');
  }

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
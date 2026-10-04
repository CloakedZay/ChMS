'use client';

import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({ dark: true, toggle: () => {} });

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('faithsync-theme');
    if (stored) setDark(stored === 'dark');
  }, []);

  // Tell the stylesheet too (scrollbars follow the theme, see globals.css).
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  function toggle() {
    setDark((prev) => {
      const next = !prev;
      localStorage.setItem('faithsync-theme', next ? 'dark' : 'light');
      return next;
    });
  }

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
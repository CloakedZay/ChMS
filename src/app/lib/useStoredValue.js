'use client';

import { useCallback, useSyncExternalStore } from 'react';

// A small setting remembered in this browser (localStorage): the theme, the
// collapsed sidebar, … Read through useSyncExternalStore, so the page draws
// once with the saved value, and every place using the same key updates
// together (also across tabs). If the browser blocks storage, the value
// still works until the page is closed.
//
//   const [theme, setTheme] = useStoredValue('faithsync-theme', 'light');

const CHANGED = 'faithsync-stored-value';
const memory = {};   // fallback when localStorage is blocked

function read(key) {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch { /* blocked: use memory */ }
  return memory[key] ?? null;
}

function subscribe(onChange) {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

export function useStoredValue(key, fallback = null) {
  const value = useSyncExternalStore(subscribe, () => read(key), () => null);
  const setValue = useCallback((next) => {
    memory[key] = next;
    try { localStorage.setItem(key, next); } catch { /* blocked: memory only */ }
    window.dispatchEvent(new Event(CHANGED));
  }, [key]);
  return [value ?? fallback, setValue];
}

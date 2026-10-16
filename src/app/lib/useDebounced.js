'use client';

import { useEffect, useState } from 'react';

// The value once it has stopped changing for `ms`: a search box asks the
// server after the person pauses typing, not on every key.
//
//   const query = useDebounced(search, 300);
export function useDebounced(value, ms = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}

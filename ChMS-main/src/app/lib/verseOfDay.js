// Deterministic "verse of the day" rotation — one verse per local calendar
// day, changing only at local midnight (12:00 AM), regardless of time zone
// or what time the page happens to load.

// Count of local calendar days since the Unix epoch, anchored to local
// midnight rather than the current time-of-day. Because it's pinned to
// midnight, it only ever increments once every 24h — the verse can't
// drift or flip mid-day from clock/timezone quirks.
export function localDayNumber(date = new Date()) {
  const localMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor(localMidnight.getTime() / 86400000);
}

// Which verse (by index into an id-ordered list) should show today.
// Note: if verses are added or removed, the list length changes, so
// today's pick can shift immediately — the daily rotation schedule itself
// is unaffected and still only advances at the next local midnight.
export function verseOfDayIndex(count, date = new Date()) {
  if (!count) return 0;
  return localDayNumber(date) % count;
}

// The next local midnight — i.e. the next time the verse of the day rotates.
export function nextLocalMidnight(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0);
}

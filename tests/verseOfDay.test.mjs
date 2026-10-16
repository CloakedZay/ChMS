// Verse of the day (src/app/lib/verseOfDay.js). Dates are built in local
// time, so these pass in any time zone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDayNumber, verseOfDayIndex, nextLocalMidnight } from '../src/app/lib/verseOfDay.js';

test('the same verse shows all day', () => {
  const morning = new Date(2026, 9, 16, 0, 0, 1);
  const night = new Date(2026, 9, 16, 23, 59, 59);
  assert.equal(localDayNumber(morning), localDayNumber(night));
  assert.equal(verseOfDayIndex(10, morning), verseOfDayIndex(10, night));
});

test('the verse moves on by one at midnight', () => {
  const before = new Date(2026, 9, 16, 23, 59, 59);
  const after = new Date(2026, 9, 17, 0, 0, 0);
  assert.equal(localDayNumber(after) - localDayNumber(before), 1);
  assert.equal(verseOfDayIndex(10, after), (verseOfDayIndex(10, before) + 1) % 10);
});

test('the index stays inside the list, and is 0 for an empty list', () => {
  for (let d = 1; d <= 40; d++) {
    const i = verseOfDayIndex(7, new Date(2026, 0, d));
    assert.ok(i >= 0 && i < 7);
  }
  assert.equal(verseOfDayIndex(0), 0);
});

test('nextLocalMidnight is the start of the next day', () => {
  assert.deepEqual(nextLocalMidnight(new Date(2026, 9, 16, 15, 30)), new Date(2026, 9, 17));
  assert.deepEqual(nextLocalMidnight(new Date(2026, 11, 31, 8)), new Date(2027, 0, 1));
});

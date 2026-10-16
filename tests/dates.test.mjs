// Philippine date (src/app/lib/phDate.js) and event times (eventTime.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phToday } from '../src/app/lib/phDate.js';
import { formatEventTime } from '../src/app/lib/eventTime.js';

test('phToday is already the next day in Manila while UTC is still on the day before', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-15T23:30:00Z') });
  assert.equal(phToday(), '2026-10-16');
});

test('phToday matches UTC once both are on the same day', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-16T03:00:00Z') });
  assert.equal(phToday(), '2026-10-16');
});

test('phToday is written YYYY-MM-DD', () => {
  assert.match(phToday(), /^\d{4}-\d{2}-\d{2}$/);
});

test('formatEventTime turns database times into 12-hour times', () => {
  assert.equal(formatEventTime('18:00:00'), '6:00 PM');
  assert.equal(formatEventTime('09:30:00'), '9:30 AM');
  assert.equal(formatEventTime('00:15'), '12:15 AM');
  assert.equal(formatEventTime('12:00:00'), '12:00 PM');
});

test('formatEventTime gives nothing for a missing or bad time', () => {
  assert.equal(formatEventTime(''), '');
  assert.equal(formatEventTime(null), '');
  assert.equal(formatEventTime('soon'), '');
});

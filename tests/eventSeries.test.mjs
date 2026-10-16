// Weekly events (src/app/lib/eventSeries.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SERIES_DATES, weeklyDates, lastSeriesDate, weekdayOf, groupSeries, collapseSeries, seriesLabel,
} from '../src/app/lib/eventSeries.js';

test('weeklyDates lists every 7 days up to and including the end date', () => {
  assert.deepEqual(weeklyDates('2026-10-18', '2026-11-08'), ['2026-10-18', '2026-10-25', '2026-11-01', '2026-11-08']);
  assert.deepEqual(weeklyDates('2026-10-18', '2026-11-07'), ['2026-10-18', '2026-10-25', '2026-11-01']);
});

test('weeklyDates crosses months and years correctly', () => {
  assert.deepEqual(weeklyDates('2026-12-27', '2027-01-10'), ['2026-12-27', '2027-01-03', '2027-01-10']);
  assert.deepEqual(weeklyDates('2028-02-26', '2028-03-04'), ['2028-02-26', '2028-03-04']); // leap year
});

test('weeklyDates stops at 52 dates (one year)', () => {
  const dates = weeklyDates('2026-01-04', '2030-01-01');
  assert.equal(dates.length, MAX_SERIES_DATES);
  assert.equal(dates.at(-1), lastSeriesDate('2026-01-04'));
});

test('weeklyDates with a missing or earlier end date gives just the start', () => {
  assert.deepEqual(weeklyDates('2026-10-18', ''), ['2026-10-18']);
  assert.deepEqual(weeklyDates('2026-10-18', '2026-10-01'), ['2026-10-18']);
  assert.deepEqual(weeklyDates('', '2026-10-18'), []);
});

test('lastSeriesDate is 51 weeks after the start', () => {
  assert.equal(lastSeriesDate('2026-10-18'), '2027-10-10');
  assert.equal(lastSeriesDate(''), '');
});

test('weekdayOf names the day of the week', () => {
  assert.equal(weekdayOf('2026-10-18'), 'Sunday');
  assert.equal(weekdayOf('2026-10-16'), 'Friday');
  assert.equal(weekdayOf(''), '');
});

const series = [
  { id: 1, series_id: 's', date: '2026-10-04', status: 'done' },
  { id: 2, series_id: 's', date: '2026-10-11', status: 'done' },
  { id: 3, series_id: 's', date: '2026-10-18', status: 'cancelled' },
  { id: 4, series_id: 's', date: '2026-10-25', status: 'approved' },
];

test('groupSeries shows one card per series, on its next date still on', () => {
  const cards = groupSeries([{ id: 9, date: '2026-10-20' }, ...series], '2026-10-16');
  assert.equal(cards.length, 2);
  assert.equal(cards[0].id, 9);              // events without a series pass through
  assert.equal(cards[1].id, 4);              // skips the cancelled 18th
  assert.deepEqual(cards[1].series, { count: 4, first: '2026-10-04', last: '2026-10-25', ids: [1, 2, 3, 4] });
});

test('groupSeries falls back to a cancelled date, then to the latest date', () => {
  const onlyCancelledLeft = series.slice(0, 3);
  assert.equal(groupSeries(onlyCancelledLeft, '2026-10-16')[0].id, 3);
  assert.equal(groupSeries(series, '2026-12-01')[0].id, 4);
});

test('collapseSeries gives one notice per series with its count and ids', () => {
  const notices = collapseSeries([{ id: 9 }, ...series]);
  assert.equal(notices.length, 2);
  assert.deepEqual([notices[0].dates, notices[0].ids], [1, [9]]);
  assert.deepEqual([notices[1].id, notices[1].dates, notices[1].ids], [1, 4, [1, 2, 3, 4]]);
});

test('seriesLabel reads "Every <day> · until <date>"', () => {
  const [card] = groupSeries(series, '2026-10-16');
  assert.equal(seriesLabel(card), 'Every Sunday · until Oct 25, 2026');
  assert.equal(seriesLabel({ date: '2026-10-18' }), '');
});

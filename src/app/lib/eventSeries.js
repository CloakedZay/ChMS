// Weekly events (db/049). Each date is its own event row; rows of one
// series share events.series_id. Lists show a series as one card.

export const MAX_SERIES_DATES = 52;   // up to a year of weekly dates

const DAY = 86400000;
const toUtc = (d) => new Date(`${d}T00:00:00Z`);
const fromUtc = (t) => new Date(t).toISOString().slice(0, 10);

// "2026-10-18" .. "2027-01-03" → every 7 days, at most MAX_SERIES_DATES.
export function weeklyDates(start, until) {
  if (!start || !until || until < start) return start ? [start] : [];
  const out = [];
  for (let t = toUtc(start).getTime(); t <= toUtc(until).getTime() && out.length < MAX_SERIES_DATES; t += 7 * DAY) {
    out.push(fromUtc(t));
  }
  return out;
}

// The last date a series may run to from `start`.
export const lastSeriesDate = (start) => (start ? fromUtc(toUtc(start).getTime() + (MAX_SERIES_DATES - 1) * 7 * DAY) : '');

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const weekdayOf = (d) => (d ? WEEKDAYS[toUtc(d).getUTCDay()] : '');

// One card per series: its next date from `today` on (else its latest),
// with the series' other dates attached. Events without a series pass
// through. Keeps the order of `events` for the cards that remain.
export function groupSeries(events, today) {
  const bySeries = new Map();
  events.forEach((e) => {
    if (e.series_id) (bySeries.get(e.series_id) || bySeries.set(e.series_id, []).get(e.series_id)).push(e);
  });
  const pick = new Map();
  bySeries.forEach((list, id) => {
    const sorted = [...list].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const next = sorted.find((e) => e.date && e.date >= today) || sorted[sorted.length - 1];
    pick.set(id, {
      ...next,
      series: { count: sorted.length, first: sorted[0].date, last: sorted[sorted.length - 1].date, ids: sorted.map((e) => e.id) },
    });
  });
  return events
    .filter((e) => !e.series_id || pick.get(e.series_id).id === e.id)
    .map((e) => (e.series_id ? pick.get(e.series_id) : e));
}

// Notices: one per series (the first in the list), with how many dates
// and their ids.
export function collapseSeries(list) {
  const seen = new Map();
  const out = [];
  list.forEach((e) => {
    if (!e.series_id) { out.push({ ...e, dates: 1, ids: [e.id] }); return; }
    const hit = seen.get(e.series_id);
    if (hit) { hit.dates += 1; hit.ids.push(e.id); return; }
    const row = { ...e, dates: 1, ids: [e.id] };
    seen.set(e.series_id, row);
    out.push(row);
  });
  return out;
}

// "Every Sunday · until Jan 3, 2027"
export function seriesLabel(event) {
  if (!event?.series) return '';
  const until = new Date(`${event.series.last}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  return `Every ${weekdayOf(event.date)} · until ${until}`;
}

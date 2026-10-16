// Reading past Supabase's 1,000-rows-per-request limit (src/app/lib/fetchAll.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAll } from '../src/app/lib/fetchAll.js';

// A stand-in for a Supabase query over `total` rows that, like Supabase,
// never returns more than `limit` rows per request.
function fakeTable(total, limit = 1000) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i + 1 }));
  const asked = [];
  const makeQuery = () => ({
    range: async (from, to) => {
      asked.push([from, to]);
      return { data: rows.slice(from, Math.min(to + 1, from + limit)), error: null };
    },
  });
  return { makeQuery, asked };
}

test('reads every row, 1,000 at a time', async () => {
  const { makeQuery, asked } = fakeTable(2500);
  const { data, error } = await fetchAll(makeQuery);
  assert.equal(error, null);
  assert.equal(data.length, 2500);
  assert.deepEqual(data.at(-1), { id: 2500 });
  assert.deepEqual(asked, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test('an exact multiple of 1,000 asks once more and stops on the empty batch', async () => {
  const { makeQuery, asked } = fakeTable(2000);
  const { data } = await fetchAll(makeQuery);
  assert.equal(data.length, 2000);
  assert.equal(asked.length, 3);
});

test('an empty table gives an empty list', async () => {
  const { data } = await fetchAll(fakeTable(0).makeQuery);
  assert.deepEqual(data, []);
});

test('an error stops and is passed on', async () => {
  const err = { code: '42501', message: 'permission denied' };
  const { data, error } = await fetchAll(() => ({ range: async () => ({ data: null, error: err }) }));
  assert.equal(data, null);
  assert.equal(error, err);
});

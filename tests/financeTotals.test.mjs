// Which ledger entries count in totals (src/app/lib/financeTotals.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countsInTotals } from '../src/app/lib/financeTotals.js';

test('a saved entry counts', () => {
  assert.equal(countsInTotals({ status: 'Verified' }), true);
  assert.equal(countsInTotals({ status: 'Pending' }), true);
  assert.equal(countsInTotals({}), true);
});

test('a voided entry never counts', () => {
  assert.equal(countsInTotals({ status: 'Void' }), false);
});

test('a balance leaves out voided entries', () => {
  const ledger = [
    { type: 'Income', amount: 1000, status: 'Verified' },
    { type: 'Income', amount: 500, status: 'Void' },
    { type: 'Expense', amount: 300, status: 'Verified' },
  ];
  const balance = ledger
    .filter(countsInTotals)
    .reduce((sum, t) => sum + (t.type === 'Income' ? t.amount : -t.amount), 0);
  assert.equal(balance, 700);
});

// Plain error messages (src/app/lib/errors.js).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { friendlyError, UserError, GENERIC_ERROR } from '../src/app/lib/errors.js';

// friendlyError logs the technical error; keep the test output clean.
const realConsoleError = console.error;
beforeEach(() => { console.error = () => {}; });
afterEach(() => { console.error = realConsoleError; });

const NO_PERMISSION = "You don't have permission to do this.";
const EXPIRED = 'Your session has expired. Please sign in again.';

test('no error gives the fallback', () => {
  assert.equal(friendlyError(null), GENERIC_ERROR);
  assert.equal(friendlyError(undefined, 'Upload failed.'), 'Upload failed.');
});

test('messages written for people are shown as they are', () => {
  assert.equal(friendlyError(new UserError('Please choose the Excel file.')), 'Please choose the Excel file.');
  assert.equal(friendlyError({ code: 'P0001', message: 'Upload at least one receipt first' }), 'Upload at least one receipt first');
  assert.equal(friendlyError({ name: 'AuthApiError', message: 'Invalid login credentials' }), 'Invalid login credentials');
});

test('an expired sign-in says so', () => {
  assert.equal(friendlyError({ name: 'AuthApiError', message: 'Invalid Refresh Token' }), EXPIRED);
  assert.equal(friendlyError({ code: 'PGRST301', message: 'JWT expired' }), EXPIRED);
});

test('database errors never show table or rule names', () => {
  const rls = friendlyError({ code: '42501', message: 'new row violates row-level security policy for table "transactions"' });
  assert.equal(rls, NO_PERMISSION);
  assert.doesNotMatch(rls, /transactions|policy/);

  assert.equal(friendlyError({ code: '23505', message: 'duplicate key value violates unique constraint "members_pkey"' }), 'This already exists.');
  assert.equal(friendlyError({ code: '23503', message: 'violates foreign key constraint' }),
    "This is still linked to other records, so it can't be changed or removed.");
  assert.equal(friendlyError({ code: '23514', message: 'violates check constraint "amount_positive"' }),
    "Some of the details aren't allowed. Please check them and try again.");
});

test('server and network problems get plain sentences', () => {
  assert.equal(friendlyError({ status: 403 }), NO_PERMISSION);
  assert.equal(friendlyError({ status: 413 }), 'That file is too large.');
  assert.equal(friendlyError({ status: 429 }), 'Too many tries. Please wait a moment and try again.');
  assert.equal(friendlyError(new TypeError('Failed to fetch')),
    "Can't reach the server. Check your internet connection and try again.");
});

test('anything else gives the fallback, not the technical text', () => {
  assert.equal(friendlyError(new Error('relation "foo" does not exist')), GENERIC_ERROR);
  assert.equal(friendlyError(new Error('boom'), 'Could not save.'), 'Could not save.');
});

test('the technical error is still logged', () => {
  const logged = [];
  console.error = (e) => logged.push(e);
  const err = new Error('boom');
  friendlyError(err);
  assert.deepEqual(logged, [err]);
});

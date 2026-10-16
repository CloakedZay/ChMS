// Peso amounts (src/app/lib/format.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { peso, pesoPdf } from '../src/app/lib/format.js';

test('peso writes amounts with commas and two decimals', () => {
  assert.equal(peso(1234.5), '₱1,234.50');
  assert.equal(peso(1000000), '₱1,000,000.00');
  assert.equal(peso(0), '₱0.00');
});

test('peso puts a minus sign before negative amounts', () => {
  assert.equal(peso(-1234.5), '−₱1,234.50');
});

test('peso reads numbers given as text, and treats bad input as zero', () => {
  assert.equal(peso('250'), '₱250.00');
  assert.equal(peso(null), '₱0.00');
  assert.equal(peso(undefined), '₱0.00');
  assert.equal(peso('abc'), '₱0.00');
});

test('pesoPdf uses PHP and a plain hyphen (the PDF font has no ₱)', () => {
  assert.equal(pesoPdf(1234.5), 'PHP 1,234.50');
  assert.equal(pesoPdf(-50), '-PHP 50.00');
});

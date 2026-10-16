// Grey text is readable: at least 4.5:1 against the backgrounds it sits on
// (WCAG AA for small text). Reads the colours from src/app/globals.css, so
// changing one there to something too faint fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// A see-through colour over a background.
const over = (rgb, alpha, bg) => rgb.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha)));

const LIGHT = { page: '#f8f7f2', white: '#ffffff', card: '#fbfaf6', tint: '#e8f0ea' };
const DARK = { page: '#111815', card: '#161e1a', panel: '#1b2420' };

// The colour a rule sets, found by its selector.
function colourOf(selector) {
  const at = css.indexOf(selector);
  assert.ok(at >= 0, `${selector} not found in globals.css`);
  const m = css.slice(at).match(/color:\s*(#[0-9a-f]{6}|rgb\([^)]*\))/i);
  return m[1];
}
function parse(colour, bg) {
  if (colour.startsWith('#')) return hex(colour);
  const [r, g, b, a] = colour.match(/[\d.]+/g).map(Number);
  return over([r, g, b], a ?? 1, bg);
}
function check(selector, backgrounds) {
  const colour = colourOf(selector);
  for (const [name, bg] of Object.entries(backgrounds)) {
    const ratio = contrast(parse(colour, hex(bg)), hex(bg));
    assert.ok(ratio >= 4.5, `${selector} (${colour}) on ${name} ${bg}: ${ratio.toFixed(2)}:1`);
  }
}

test('light theme: faint greys pass on ivory, white and cards', () => {
  check('.text-\\[\\#858b87\\]:not(svg) {', LIGHT);
});

test('dark theme: faint greys pass on the page, cards and pop-ups', () => {
  check('.text-slate-700:not(svg) {', DARK);
  check('.text-white\\/40:not(svg) {', DARK);
});

test('member pages in light mode: remapped greys pass', () => {
  check('.member-light .text-slate-500 {', LIGHT);
  check('.member-light .text-slate-700 {', LIGHT);
  check('.member-light .text-white\\/20 {', LIGHT);
  check('.member-light .text-white\\/60 {', LIGHT);
});

test('the contrast maths is right', () => {
  assert.equal(contrast(hex('#000000'), hex('#ffffff')).toFixed(1), '21.0');
  assert.equal(contrast(hex('#777777'), hex('#ffffff')).toFixed(2), '4.48');
});

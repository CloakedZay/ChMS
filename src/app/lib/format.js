// Money as it's written in the Philippines: ₱1,234.50, and −₱1,234.50 when
// negative. One place, so every page shows amounts the same way.

const amount = (n) => Math.abs(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 });

export function peso(n) {
  return `${Number(n) < 0 ? '−' : ''}₱${amount(n)}`;
}

// For the PDF report: its built-in font has no ₱ sign.
export function pesoPdf(n) {
  return `${Number(n) < 0 ? '-' : ''}PHP ${amount(n)}`;
}

// Philippine mobile numbers only: 09XX XXX XXXX or +63 9XX XXX XXXX. Short
// codes like 911 or 117 are refused. Returns the number as 09XXXXXXXXX, '' when
// left blank, or null when it isn't a mobile number.
export const PHONE_HINT = 'Use an 11-digit mobile number starting with 09 (e.g. 0917 123 4567).';

export function cleanPhone(v) {
  let d = String(v ?? '').replace(/[\s\-().]/g, '');
  if (!d) return '';
  if (/^\+639\d{9}$/.test(d)) d = '0' + d.slice(3);
  else if (/^639\d{9}$/.test(d)) d = '0' + d.slice(2);
  else if (/^9\d{9}$/.test(d)) d = '0' + d;
  return /^09\d{9}$/.test(d) ? d : null;
}

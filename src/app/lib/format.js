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

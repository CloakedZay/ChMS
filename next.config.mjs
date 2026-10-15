// Security headers on every page and API reply (docs/SYSTEM.md, Security):
// - no other site may show FaithSync inside a frame (stops click-tricking)
// - the browser must trust the stated file type, not guess it
// - links to other sites don't carry the page address with them
// - camera, microphone and location stay off (photos are picked as files)
// - once served over HTTPS, the browser keeps using HTTPS for a year
const securityHeaders = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', '@huggingface/transformers', 'onnxruntime-node', 'sharp'],
  // NEXT_DIST_DIR lets a test build write to its own folder (e.g. .next-check)
  // so it never clashes with a running `npm run dev`, which uses .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;

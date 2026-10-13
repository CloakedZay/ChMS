/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', '@huggingface/transformers', 'onnxruntime-node', 'sharp'],
  // NEXT_DIST_DIR lets a test build write to its own folder (e.g. .next-check)
  // so it never clashes with a running `npm run dev`, which uses .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;

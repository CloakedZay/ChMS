/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', '@huggingface/transformers', 'onnxruntime-node', 'sharp'],
};

export default nextConfig;

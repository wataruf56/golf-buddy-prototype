/** @type {import('next/config').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  images: { unoptimized: true },
  reactStrictMode: true,
  // Emit a self-contained server bundle (.next/standalone) so we can run the
  // app in a small Docker container on Cloud Run. No effect on Vercel.
  output: 'standalone',
};

module.exports = nextConfig;

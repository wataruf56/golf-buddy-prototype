/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  // Never cache API or auth routes — always hit the network for fresh data.
  buildExcludes: [/middleware-manifest\.json$/],
  runtimeCaching: [
    {
      urlPattern: /\/api\/.*/i,
      handler: 'NetworkOnly',
      method: 'GET',
    },
    {
      urlPattern: /\/api\/.*/i,
      handler: 'NetworkOnly',
      method: 'POST',
    },
    {
      urlPattern: /\/api\/.*/i,
      handler: 'NetworkOnly',
      method: 'PATCH',
    },
    {
      // App shell pages: prefer network, fall back to cache when offline only.
      urlPattern: ({ request, url }) =>
        request.mode === 'navigate' && !url.pathname.startsWith('/api/'),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages',
        expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 },
      },
    },
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'images', expiration: { maxEntries: 64 } },
    },
    {
      urlPattern: /\.(?:js|css)$/i,
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'static-assets' },
    },
  ],
});

module.exports = withPWA({
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
        ],
      },
    ];
  },
});

/** @type {import('next').NextConfig} */

// Content-Security-Policy. Kept deliberately tight: no third-party trackers exist
// in this product, so the only external origins are Supabase (API + Storage),
// Razorpay checkout, and the image hosts we render remote thumbnails from.
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

/**
 * HSTS and upgrade-insecure-requests are keyed on the configured origin rather
 * than NODE_ENV. If the app is served over plain HTTP — a local `next start`,
 * a preview on an internal host — telling the browser to upgrade every
 * subresource to https is simply wrong, and WebKit obeys it even on localhost
 * (Chromium exempts it), which breaks the app outright in Safari.
 */
const isSecureOrigin = (process.env.NEXT_PUBLIC_APP_URL || '').startsWith('https://');

const csp = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts; 'unsafe-inline' is required for the
  // App Router runtime. Razorpay checkout is loaded on the plans screen only.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `img-src 'self' data: blob: https://img.youtube.com https://i.ytimg.com ${supabaseOrigin}`,
  `connect-src 'self' ${supabaseOrigin} https://api.razorpay.com https://lumberjack.razorpay.com wss:`,
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isSecureOrigin ? ['upgrade-insecure-requests'] : []),
]
  .filter(Boolean)
  .join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  // HSTS is meaningless over plain HTTP and would poison a developer's
  // localhost for two years if a browser ever cached it from one.
  ...(isSecureOrigin
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'img.youtube.com' },
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // The service worker must not be cached, or clients pin an old build forever.
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;

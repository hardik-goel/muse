import type { Metadata, Viewport } from 'next';
import './globals.css';
import { fontVariables } from './fonts';
import { ToastProvider } from '@/components/ui/Toast';
import { ServiceWorkerRegistrar } from '@/components/pwa/ServiceWorkerRegistrar';
import { publicEnv } from '@/lib/env';

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.appUrl),
  title: {
    default: 'Muse.',
    template: '%s · Muse.',
  },
  description: 'Everything you find, one calm place.',
  applicationName: 'Muse',
  // The manifest link, the apple-touch-icon and every apple-mobile-web-app-*
  // tag are declared in <head> in the layout below instead of here. Metadata
  // returned from this export is streamed into the body, which iOS ignores.
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'Muse.',
    description: 'Everything you find, one calm place.',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#171216',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  // Zooming stays available: pinch-to-zoom is an accessibility affordance.
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={fontVariables} suppressHydrationWarning>
      {/*
        Declared here rather than left to the metadata export, which Next
        streams into the body and hoists with a script. Chrome copes; iOS Safari
        reads apple-mobile-web-app-capable out of <head> while parsing and never
        looks again, so a tag that arrives in the body is a tag that does not
        exist — and the home-screen icon opens a browser tab instead of the app.
        Static markup, so it lands in the first bytes of the document.
      */}
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Muse" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
      </head>
      <body className="min-h-dvh bg-bg font-body text-text antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-pill focus:bg-champagne focus:px-4 focus:py-2 focus:text-bg"
        >
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}

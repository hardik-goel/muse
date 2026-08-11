import { Instrument_Serif, Albert_Sans, IBM_Plex_Mono } from 'next/font/google';

/**
 * next/font downloads and self-hosts these at build time — no runtime request
 * to Google, which is what keeps the CSP free of external font origins.
 */

export const display = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
  fallback: ['Georgia', 'serif'],
});

export const body = Albert_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

export const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'monospace'],
});

export const fontVariables = `${display.variable} ${body.variable} ${mono.variable}`;

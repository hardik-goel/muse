import { describe, expect, it } from 'vitest';
import {
  detectPlatform,
  extractUrl,
  isSafePublicUrl,
  normaliseUrl,
  thumbnailFor,
  youtubeId,
} from '@/lib/url';

describe('extractUrl', () => {
  it('pulls a link out of surrounding prose', () => {
    expect(extractUrl('look at this https://example.com/post it is good')).toBe(
      'https://example.com/post',
    );
  });

  it('drops trailing sentence punctuation', () => {
    expect(extractUrl('read https://example.com/post.')).toBe('https://example.com/post');
    expect(extractUrl('(https://example.com/a)')).toBe('https://example.com/a');
  });

  it('returns null when there is no link', () => {
    expect(extractUrl('just a thought')).toBeNull();
  });
});

describe('detectPlatform', () => {
  it.each([
    ['https://www.instagram.com/p/abc', 'instagram'],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtube'],
    ['https://open.spotify.com/track/1', 'spotify'],
    ['https://x.com/user/status/1', 'x'],
    ['https://twitter.com/user/status/1', 'x'],
    ['https://www.linkedin.com/posts/1', 'linkedin'],
    ['https://someone.substack.com/p/a', 'substack'],
    ['https://example.com', 'web'],
  ])('%s => %s', (url, expected) => {
    expect(detectPlatform(url)).toBe(expected);
  });

  it('is null for a non-URL', () => {
    expect(detectPlatform('not a url')).toBeNull();
    expect(detectPlatform(null)).toBeNull();
  });
});

describe('normaliseUrl', () => {
  it('collapses the variants that mean the same page', () => {
    const canonical = normaliseUrl('https://example.com/post');
    expect(normaliseUrl('https://www.example.com/post/')).toBe(canonical);
    expect(normaliseUrl('https://EXAMPLE.com/post#section')).toBe(canonical);
    expect(normaliseUrl('http://example.com/post?utm_source=x&fbclid=y')).toBe(canonical);
  });

  it('keeps meaningful query parameters and sorts them', () => {
    expect(normaliseUrl('https://example.com/a?b=2&a=1')).toBe('https://example.com/a?a=1&b=2');
  });

  it('does not fork a duplicate over a trailing slash before a query', () => {
    expect(normaliseUrl('https://example.com/post/?id=7')).toBe(
      normaliseUrl('https://example.com/post?id=7'),
    );
  });

  it('returns null for junk', () => {
    expect(normaliseUrl('not a url')).toBeNull();
    expect(normaliseUrl(null)).toBeNull();
  });
});

describe('youtubeId and thumbnailFor', () => {
  it.each([
    ['https://www.youtube.com/watch?v=aircAruvnKk', 'aircAruvnKk'],
    ['https://youtu.be/aircAruvnKk', 'aircAruvnKk'],
    ['https://www.youtube.com/shorts/aircAruvnKk', 'aircAruvnKk'],
    ['https://www.youtube.com/embed/aircAruvnKk', 'aircAruvnKk'],
  ])('%s', (url, id) => {
    expect(youtubeId(url)).toBe(id);
  });

  it('gives YouTube a real thumbnail and everything else none', () => {
    expect(thumbnailFor('https://youtu.be/abc')).toBe('https://img.youtube.com/vi/abc/mqdefault.jpg');
    expect(thumbnailFor('https://example.com')).toBeNull();
    expect(thumbnailFor(null)).toBeNull();
  });
});

describe('isSafePublicUrl', () => {
  it.each([
    'http://localhost:3000',
    'http://127.0.0.1/admin',
    'http://10.0.0.5',
    'http://192.168.1.1',
    'http://172.16.0.1',
    'http://169.254.169.254/latest/meta-data',
    'http://metadata.google.internal/x',
    'http://[::1]/',
    'http://[::]/',
    'http://[fd00::1]/',
    'http://[fe80::1]/',
    'http://[::ffff:127.0.0.1]/',
    'file:///etc/passwd',
    'https://user:pass@example.com',
    'http://intranet',
  ])('blocks %s', (url) => {
    expect(isSafePublicUrl(url)).toBe(false);
  });

  it.each(['https://example.com', 'http://example.com/a?b=1', 'https://sub.example.co.uk/x'])(
    'allows %s',
    (url) => {
      expect(isSafePublicUrl(url)).toBe(true);
    },
  );
});

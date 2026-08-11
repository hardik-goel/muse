import { describe, expect, it } from 'vitest';
import { findDuplicate, tokenOverlap, TITLE_OVERLAP_THRESHOLD } from '@/lib/dupe';
import { normaliseUrl, detectPlatform, youtubeId, isSafePublicUrl, thumbnailFor } from '@/lib/url';

describe('normaliseUrl', () => {
  it('strips tracking params, www, fragments and trailing slashes', () => {
    expect(normaliseUrl('https://www.example.com/post/?utm_source=x&id=7#top')).toBe(
      'https://example.com/post?id=7',
    );
  });

  it('treats http and https as the same resource', () => {
    expect(normaliseUrl('http://example.com/a')).toBe(normaliseUrl('https://example.com/a'));
  });

  it('sorts query params so ordering does not fork duplicates', () => {
    expect(normaliseUrl('https://e.com/x?b=2&a=1')).toBe(normaliseUrl('https://e.com/x?a=1&b=2'));
  });

  it('returns null for junk', () => {
    expect(normaliseUrl('not a url')).toBeNull();
    expect(normaliseUrl(null)).toBeNull();
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
    ['https://someone.substack.com/p/thing', 'substack'],
    ['https://blog.example.com/post', 'web'],
  ])('reads %s as %s', (url, platform) => {
    expect(detectPlatform(url)).toBe(platform);
  });
});

describe('youtube thumbnails', () => {
  it.each([
    ['https://www.youtube.com/watch?v=abc123', 'abc123'],
    ['https://youtu.be/abc123', 'abc123'],
    ['https://www.youtube.com/shorts/abc123', 'abc123'],
    ['https://www.youtube.com/embed/abc123', 'abc123'],
  ])('extracts the id from %s', (url, id) => {
    expect(youtubeId(url)).toBe(id);
  });

  it('builds the mqdefault thumbnail url', () => {
    expect(thumbnailFor('https://youtu.be/abc123')).toBe(
      'https://img.youtube.com/vi/abc123/mqdefault.jpg',
    );
  });

  it('has no thumbnail for non-YouTube links', () => {
    expect(thumbnailFor('https://example.com')).toBeNull();
  });
});

describe('isSafePublicUrl (SSRF guard)', () => {
  it.each([
    'http://localhost/admin',
    'http://127.0.0.1:8080',
    'http://10.0.0.5/',
    'http://192.168.1.1/',
    'http://172.16.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://metadata.google.internal/',
    'file:///etc/passwd',
    'gopher://example.com',
    'http://user:pass@example.com/',
    'http://intranet/',
  ])('blocks %s', (url) => {
    expect(isSafePublicUrl(url)).toBe(false);
  });

  it.each(['https://example.com/post', 'http://blog.example.co.in/x'])('allows %s', (url) => {
    expect(isSafePublicUrl(url)).toBe(true);
  });
});

describe('tokenOverlap', () => {
  it('ignores stopwords and punctuation', () => {
    expect(tokenOverlap('The Dune movie, reviewed', 'Dune movie review')).toBeGreaterThan(0.5);
  });

  it('is 1 for a subset title', () => {
    expect(tokenOverlap('Dune', 'Dune movie review')).toBe(1);
  });

  it('is 0 for unrelated text', () => {
    expect(tokenOverlap('Squat programming', 'Bake sourdough bread')).toBe(0);
  });
});

describe('findDuplicate', () => {
  const existing = [
    {
      id: 'a',
      title: 'How to rest well',
      created_at: '2026-08-01T00:00:00Z',
      thumb_url: null,
      url: 'https://example.com/rest',
      url_normalized: 'https://example.com/rest',
    },
    {
      id: 'b',
      title: 'Sourdough starter notes',
      created_at: '2026-08-02T00:00:00Z',
      thumb_url: null,
      url: null,
      url_normalized: null,
    },
  ];

  it('matches on normalised url with full confidence', () => {
    const hit = findDuplicate(
      { url: 'https://www.example.com/rest/?utm_source=news', title: 'Something else' },
      existing,
    );
    expect(hit?.item.id).toBe('a');
    expect(hit?.reason).toBe('url');
    expect(hit?.confidence).toBe(1);
  });

  it('matches on title overlap at or above the threshold', () => {
    const hit = findDuplicate({ url: null, title: 'Sourdough starter' }, existing);
    expect(hit?.item.id).toBe('b');
    expect(hit?.reason).toBe('title');
    expect(hit?.confidence).toBeGreaterThanOrEqual(TITLE_OVERLAP_THRESHOLD);
  });

  it('does not fire on a loose resemblance', () => {
    expect(findDuplicate({ url: null, title: 'A note about bread prices' }, existing)).toBeNull();
  });

  it('returns null against an empty library', () => {
    expect(findDuplicate({ url: 'https://x.com/a', title: 'Anything' }, [])).toBeNull();
  });
});

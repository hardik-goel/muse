import { describe, expect, it } from 'vitest';
import { extractJson } from '@/lib/ai/anthropic';
import { isDueNow } from '@/lib/server/jobs';
import { sniffImageMime, thumbObjectPath, thumbPublicUrl, isManagedThumb } from '@/lib/server/storage';
import { timingSafeEqual } from '@/lib/api';
import { digestEmail } from '@/lib/email';

describe('extractJson', () => {
  it('reads a bare object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('reads through a code fence', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('ignores prose either side of the object', () => {
    expect(extractJson('Sure, here you go:\n{"a":1}\nHope that helps.')).toEqual({ a: 1 });
  });

  it('reads an array', () => {
    expect(extractJson('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('throws when there is no JSON at all', () => {
    expect(() => extractJson('I cannot do that')).toThrow();
  });
});

describe('isDueNow', () => {
  // 07:30 IST is 02:00 UTC.
  const at = (utc: string) => new Date(`2026-08-11T${utc}:00.000Z`);

  it('fires inside the seven-minute window', () => {
    expect(isDueNow('07:30', 'Asia/Kolkata', at('02:00'))).toBe(true);
    expect(isDueNow('07:30', 'Asia/Kolkata', at('01:55'))).toBe(true);
    expect(isDueNow('07:30', 'Asia/Kolkata', at('02:06'))).toBe(true);
  });

  it('stays quiet outside it', () => {
    expect(isDueNow('07:30', 'Asia/Kolkata', at('02:15'))).toBe(false);
    expect(isDueNow('07:30', 'Asia/Kolkata', at('12:00'))).toBe(false);
  });

  it('respects the caller timezone rather than the server clock', () => {
    // 07:30 in New York is 11:30 UTC in August.
    expect(isDueNow('07:30', 'America/New_York', at('11:30'))).toBe(true);
    expect(isDueNow('07:30', 'America/New_York', at('02:00'))).toBe(false);
  });

  it('wraps around midnight instead of treating it as a 24h gap', () => {
    expect(isDueNow('00:00', 'UTC', new Date('2026-08-11T23:57:00.000Z'))).toBe(true);
  });
});

describe('sniffImageMime', () => {
  const pad = (head: number[]) => new Uint8Array([...head, ...new Array(16).fill(0)]);

  it('recognises the three formats the bucket accepts', () => {
    expect(sniffImageMime(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageMime(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(
      sniffImageMime(
        pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
      ),
    ).toBe('image/webp');
  });

  it('rejects anything else, including a claimed content type', () => {
    expect(sniffImageMime(pad([0x3c, 0x73, 0x76, 0x67]))).toBeNull(); // <svg
    expect(sniffImageMime(pad([0x25, 0x50, 0x44, 0x46]))).toBeNull(); // %PDF
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8]))).toBeNull(); // too short
  });
});

describe('thumbnail paths', () => {
  const userId = '11111111-1111-4111-8111-111111111111';

  it('always begins with the owner segment the policies match on', () => {
    expect(thumbObjectPath(userId, 'abc', 'thumb')).toBe(`${userId}/abc.webp`);
    expect(thumbObjectPath(userId, 'abc', 'full')).toBe(`${userId}/abc-full.webp`);
  });

  it('round-trips through the proxy URL', () => {
    const url = thumbPublicUrl(thumbObjectPath(userId, 'abc', 'thumb'));
    expect(url).toBe(`/api/thumb/${userId}/abc.webp`);
    expect(isManagedThumb(url)).toBe(true);
    expect(isManagedThumb('https://img.youtube.com/vi/x/mqdefault.jpg')).toBe(false);
    expect(isManagedThumb(null)).toBe(false);
  });
});

describe('timingSafeEqual', () => {
  it('matches identical strings and nothing else', () => {
    expect(timingSafeEqual('secret', 'secret')).toBe(true);
    expect(timingSafeEqual('secret', 'secrez')).toBe(false);
    expect(timingSafeEqual('secret', 'secret-longer')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
  });
});

describe('digestEmail', () => {
  const input = {
    name: 'Sam',
    done: 3,
    captured: 9,
    inboxWaiting: 4,
    reflection: 'You finished 3 things this week.',
    appUrl: 'https://muse.test',
  };

  it('leads with the number that matters', () => {
    expect(digestEmail(input).subject).toBe('3 finished this week');
    expect(digestEmail({ ...input, done: 0 }).subject).toBe('Nothing finished this week');
  });

  it('carries no emoji and at most one exclamation', () => {
    const { text } = digestEmail(input);
    expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false);
    expect((text.match(/!/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it('escapes HTML rather than interpolating it', () => {
    const { html } = digestEmail({ ...input, name: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

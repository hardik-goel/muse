import type { Platform } from '@/lib/types';

/** URL intelligence: platform detection, normalisation, thumbnails, SSRF guards. */

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'fbclid',
  'igshid',
  'igsh',
  'si',
  'ref',
  'ref_src',
  'ref_url',
  'source',
  'mc_cid',
  'mc_eid',
  '_branch_match_id',
]);

export function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"')]+/i);
  return match ? match[0].replace(/[.,;:!?)]+$/, '') : null;
}

export function detectPlatform(url: string | null): Platform {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }

  if (host.endsWith('instagram.com')) return 'instagram';
  if (host.endsWith('youtube.com') || host === 'youtu.be') return 'youtube';
  if (host.endsWith('spotify.com')) return 'spotify';
  if (host === 'x.com' || host.endsWith('twitter.com')) return 'x';
  if (host.endsWith('linkedin.com')) return 'linkedin';
  if (host.endsWith('substack.com')) return 'substack';
  return 'web';
}

/**
 * Canonical form used for exact-match duplicate detection: lowercase host,
 * no www, no tracking params, no trailing slash, no fragment.
 */
export function normaliseUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    parsed.protocol = 'https:';

    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) parsed.searchParams.delete(key);
    }
    parsed.searchParams.sort();

    // Strip the trailing slash from the PATH, not the whole string — otherwise
    // "/post/?id=7" keeps its slash and forks a duplicate off "/post?id=7".
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export function youtubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return parsed.pathname.slice(1).split('/')[0] || null;
    if (!host.endsWith('youtube.com')) return null;
    const v = parsed.searchParams.get('v');
    if (v) return v;
    const shorts = parsed.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/);
    return shorts?.[1] ?? null;
  } catch {
    return null;
  }
}

/** YouTube gives us a free thumbnail; everything else falls back to a tile. */
export function thumbnailFor(url: string | null): string | null {
  if (!url) return null;
  const id = youtubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}

/** Platform gradient tiles, used when no real thumbnail exists. */
export const PLATFORM_GRADIENT: Record<NonNullable<Platform>, string> = {
  instagram: 'linear-gradient(135deg, #833AB4, #FD1D1D, #FCB045)',
  youtube: 'linear-gradient(135deg, #FF0000, #7A0F0F)',
  spotify: 'linear-gradient(135deg, #1DB954, #0B4B27)',
  x: 'linear-gradient(135deg, #2A2127, #0B0B0B)',
  linkedin: 'linear-gradient(135deg, #0A66C2, #08355F)',
  substack: 'linear-gradient(135deg, #FF6719, #8A3A0F)',
  web: 'linear-gradient(135deg, #4A2230, #2E161F)',
};

export const PLATFORM_LABEL: Record<NonNullable<Platform>, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  spotify: 'Spotify',
  x: 'X',
  linkedin: 'LinkedIn',
  substack: 'Substack',
  web: 'Web',
};

/**
 * Instagram walls off its content to servers. We infer what we can and the UI
 * hints the user to paste the caption rather than pretending we read the post.
 */
export function isWalled(platform: Platform): boolean {
  return platform === 'instagram';
}

// ── SSRF protection ─────────────────────────────────────────────────────────

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

/**
 * Extracts the IPv4 address out of an IPv4-mapped IPv6 host, in either form.
 *
 * `::ffff:127.0.0.1` survives parsing as the hex `::ffff:7f00:1`, so matching
 * only the dotted-quad spelling would let loopback back in through the door
 * the bracket-stripping just closed.
 */
function mappedIpv4(host: string): string | null {
  const dotted = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted?.[1]) return dotted[1];

  const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;

  const high = Number.parseInt(hex[1] as string, 16);
  const low = Number.parseInt(hex[2] as string, 16);
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

/**
 * Guards any server-side fetch of a user-supplied URL. Blocks non-HTTP schemes,
 * localhost, link-local, private ranges, IPv6 loopback/ULA, and bare hostnames
 * with no dot (which resolve to internal services on most networks).
 */
export function isSafePublicUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;

  // WHATWG URL keeps the square brackets on an IPv6 literal, so they are
  // stripped here — otherwise "[::1]" never equals "::1" and loopback walks
  // straight through the check below.
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return false;
  if (!host.includes('.') && !host.includes(':')) return false;

  // Literal IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    if (PRIVATE_V4.some((re) => re.test(host))) return false;
  }

  // Literal IPv6: loopback, unspecified, unique-local (fc00::/7) and
  // link-local (fe80::/10), plus IPv4-mapped forms of any of the above.
  if (host.includes(':')) {
    if (host === '::1' || host === '::') return false;
    if (/^f[cd]/.test(host) || host.startsWith('fe80')) return false;

    const mapped = mappedIpv4(host);
    if (mapped && PRIVATE_V4.some((re) => re.test(mapped))) return false;
  }

  // Cloud metadata endpoints.
  if (host === '169.254.169.254' || host === 'metadata.google.internal') return false;

  return true;
}

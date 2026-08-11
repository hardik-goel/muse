import type { Item } from '@/lib/types';
import { normaliseUrl } from '@/lib/url';

/**
 * Duplicate detection, run BEFORE the classifier so we never pay for AI on
 * something the user already has. Two cheap signals here; the semantic upgrade
 * (cosine > 0.9) layers on top in lib/embeddings.ts.
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'this', 'that', 'at', 'by',
  'from', 'as', 'how', 'why', 'what', 'my', 'your',
]);

export function tokenise(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 1 && !STOPWORDS.has(word)),
  );
}

/** Overlap coefficient, not Jaccard: "Dune" vs "Dune movie review" should match. */
export function tokenOverlap(a: string, b: string): number {
  const setA = tokenise(a);
  const setB = tokenise(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;

  return shared / Math.min(setA.size, setB.size);
}

export const TITLE_OVERLAP_THRESHOLD = 0.7;
export const SEMANTIC_THRESHOLD = 0.9;

export interface DupeHit {
  item: Pick<Item, 'id' | 'title' | 'created_at' | 'thumb_url' | 'url'>;
  reason: 'url' | 'title' | 'semantic';
  confidence: number;
}

/**
 * Exact normalised-URL match beats everything; otherwise the highest title
 * overlap at or above 0.7 wins. Returns null when nothing is close enough.
 */
export function findDuplicate(
  candidate: { url: string | null; title: string },
  existing: Pick<Item, 'id' | 'title' | 'created_at' | 'thumb_url' | 'url' | 'url_normalized'>[],
): DupeHit | null {
  const normalised = normaliseUrl(candidate.url);

  if (normalised) {
    const urlHit = existing.find((item) => item.url_normalized === normalised);
    if (urlHit) return { item: urlHit, reason: 'url', confidence: 1 };
  }

  if (!candidate.title.trim()) return null;

  let best: DupeHit | null = null;
  for (const item of existing) {
    const overlap = tokenOverlap(candidate.title, item.title);
    if (overlap >= TITLE_OVERLAP_THRESHOLD && (!best || overlap > best.confidence)) {
      best = { item, reason: 'title', confidence: overlap };
    }
  }
  return best;
}

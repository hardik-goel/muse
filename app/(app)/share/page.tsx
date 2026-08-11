import type { Metadata } from 'next';
import { ShareCapture } from '@/components/capture/ShareCapture';

export const metadata: Metadata = {
  title: 'Drop it in',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The Web Share Target. An installed Muse appears in the OS share sheet, and
 * anything shared into it lands here with the capture sheet already open and
 * already filled in.
 */
export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; text?: string; url?: string }>;
}) {
  const params = await searchParams;

  // Android sends the link in `text` for some apps and `url` for others, and
  // occasionally in both. Dedupe rather than dropping the same URL in twice.
  const parts = [params.title, params.text, params.url]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  const unique = parts.filter((part, index) => parts.indexOf(part) === index);
  const shared = unique.filter((part, index) =>
    unique.every((other, otherIndex) => otherIndex === index || !other.includes(part)),
  );

  return <ShareCapture initialText={shared.join('\n')} />;
}

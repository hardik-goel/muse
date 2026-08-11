import Link from 'next/link';
import { Wordmark } from '@/components/ui/Wordmark';

export default function NotFound() {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gutter text-center"
    >
      <Wordmark size="md" />

      <h1 className="mt-8 max-w-[20ch] font-display text-[clamp(1.75rem,8vw,2.5rem)] leading-tight text-text">
        Nothing lives here.
      </h1>
      <p className="mt-3 max-w-[32ch] text-sm leading-relaxed text-muted">
        The page is gone, or it never was. Your library is where you left it.
      </p>

      <Link
        href="/now"
        className="mt-8 inline-flex h-12 items-center justify-center rounded-pill bg-champagne px-6 font-medium text-bg"
      >
        Back to Now
      </Link>
    </main>
  );
}

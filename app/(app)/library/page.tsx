import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LibraryTab } from '@/components/library/LibraryTab';
import { LoadingState } from '@/components/ui/States';

export const metadata: Metadata = { title: 'Library' };

export default function LibraryPage() {
  // LibraryTab reads useSearchParams for the "/" shortcut, so it needs a boundary.
  return (
    <Suspense fallback={<LoadingState rows={5} />}>
      <LibraryTab />
    </Suspense>
  );
}

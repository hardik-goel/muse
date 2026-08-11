import { Suspense } from 'react';
import { LibraryTab } from '@/components/library/LibraryTab';
import { LoadingState } from '@/components/ui/States';

export default function GuestLibraryPage() {
  return (
    <Suspense fallback={<LoadingState rows={5} />}>
      <LibraryTab />
    </Suspense>
  );
}

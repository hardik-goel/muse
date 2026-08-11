'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CaptureSheet } from '@/components/capture/CaptureSheet';
import { EmptyState } from '@/components/ui/States';

/**
 * Opens the capture sheet immediately with whatever the OS handed over, and
 * returns to Now when it closes. The share sheet should feel like one action,
 * not a navigation into an app.
 */
export function ShareCapture({ initialText }: { initialText: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <>
      <EmptyState
        headline="Dropping it in."
        hint={initialText ? undefined : 'Nothing came through with that share.'}
      />
      <CaptureSheet
        open={open}
        initialText={initialText}
        onClose={() => {
          setOpen(false);
          router.replace('/now');
        }}
      />
    </>
  );
}

'use client';

import { useCallback, useRef, useState } from 'react';
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGES_PER_DROP,
  blobToDataUrl,
  prepareImage,
} from '@/lib/images';

export interface StagedImage {
  id: string;
  name: string;
  previewUrl: string;
  /** Storage path once uploaded (signed-in), or a data URL in guest mode. */
  storedPath?: string;
  dataUrl?: string;
}

/**
 * Up to six images per drop, each becoming its own item. Downscaling happens
 * before upload so a 5MB phone photo never crosses the wire at full size.
 */
export function ImagePicker({
  images,
  onChange,
  guest,
}: {
  images: StagedImage[];
  onChange: (next: StagedImage[]) => void;
  guest: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;

      const room = MAX_IMAGES_PER_DROP - images.length;
      if (room <= 0) {
        setError(`Six at a time, maximum.`);
        return;
      }

      setBusy(true);
      setError(null);
      const staged: StagedImage[] = [];

      for (const file of Array.from(fileList).slice(0, room)) {
        try {
          const prepared = await prepareImage(file);
          const entry: StagedImage = {
            id: `${file.name}-${file.size}-${staged.length}`,
            name: file.name.replace(/\.\w+$/, ''),
            previewUrl: prepared.previewUrl,
          };

          if (guest) {
            // No bucket in guest mode — the thumb rides along in the tab.
            entry.dataUrl = await blobToDataUrl(prepared.thumb);
          } else {
            entry.storedPath = await uploadImage(prepared.full, prepared.thumb);
          }

          staged.push(entry);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'That image would not upload.');
        }
      }

      onChange([...images, ...staged]);
      setBusy(false);
    },
    [images, onChange, guest],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {images.map((image) => (
          <div key={image.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.previewUrl}
              alt=""
              className="h-16 w-16 rounded-2xl border border-line object-cover"
            />
            <button
              type="button"
              aria-label={`Remove ${image.name}`}
              onClick={() => onChange(images.filter((i) => i.id !== image.id))}
              className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-line bg-bg text-xs text-muted"
            >
              ✕
            </button>
          </div>
        ))}

        {images.length < MAX_IMAGES_PER_DROP ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-line text-xl text-faint transition-colors hover:border-champagne/40 hover:text-muted disabled:opacity-50"
            aria-label="Add images"
          >
            {busy ? '…' : '+'}
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(',')}
        multiple
        className="sr-only"
        onChange={(event) => {
          void onFiles(event.target.files);
          event.target.value = '';
        }}
      />

      {error ? (
        <p role="alert" className="text-xs text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Posts the prepared blobs to the upload route, which re-encodes server-side. */
async function uploadImage(full: Blob, thumb: Blob): Promise<string> {
  const form = new FormData();
  form.append('full', full, 'full.webp');
  form.append('thumb', thumb, 'thumb.webp');

  const res = await fetch('/api/upload', { method: 'POST', body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'That image would not upload.');
  }
  const body = (await res.json()) as { thumbPath: string };
  return body.thumbPath;
}

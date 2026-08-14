'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { useStore } from '@/components/shell/StoreProvider';
import { useToast } from '@/components/ui/Toast';
import { DuplicateCard } from '@/components/capture/DuplicateCard';
import { ImagePicker, type StagedImage } from '@/components/capture/ImagePicker';
import { MicButton } from '@/components/capture/MicButton';
import type { DupeHit } from '@/lib/dupe';
import type { ItemType } from '@/lib/types';
import { ITEM_TYPES } from '@/lib/types';
import { detectPlatform, extractUrl, isWalled } from '@/lib/url';

type Mode = 'smart' | 'manual';

/**
 * "+ Drop" — the whole capture surface.
 *
 * Smart Drop takes anything: a link, a paragraph, a poem, up to six images.
 * Nothing here blocks on AI. The item appears the moment you hit Drop; the
 * classifier patches it afterwards, and if the classifier dies the item is
 * still there, raw and editable.
 */
export function CaptureSheet({
  open,
  onClose,
  initialText = '',
}: {
  open: boolean;
  onClose: () => void;
  initialText?: string;
}) {
  const { capture, captureManual, groups, guest } = useStore();
  const toast = useToast();

  const [mode, setMode] = useState<Mode>('smart');
  const [raw, setRaw] = useState(initialText);
  const [images, setImages] = useState<StagedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [duplicate, setDuplicate] = useState<DupeHit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setRaw(initialText);
      setDuplicate(null);
      setError(null);
      setMode('smart');
      // Focus lands in the box: the fastest possible path from intent to input.
      setTimeout(() => textareaRef.current?.focus(), 60);
    } else {
      setImages([]);
    }
  }, [open, initialText]);

  const url = extractUrl(raw);
  const platform = detectPlatform(url);

  const submitSmart = useCallback(
    async (force = false) => {
      const text = raw.trim();
      if (!text && images.length === 0) {
        setError('Drop something in first.');
        return;
      }

      setBusy(true);
      setError(null);

      try {
        // Each image becomes its own item, per the capture contract.
        if (images.length > 0) {
          for (const image of images) {
            await capture({
              raw: text || image.name,
              source: 'app',
              thumbPath: image.storedPath ?? image.dataUrl,
              force: true,
              clientId: undefined,
            });
          }
          toast.push({
            message: `${images.length} dropped. Organising…`,
            tone: 'good',
          });
          onClose();
          return;
        }

        const result = await capture({ raw: text, source: 'app', force });

        if (result.duplicate && !force) {
          setDuplicate(result.duplicate);
          setBusy(false);
          return;
        }

        toast.push({ message: 'Dropped. Organising…', tone: 'good' });
        onClose();
      } catch (err) {
        // The input stays on screen. A failed drop never costs the user words.
        setError(err instanceof Error ? err.message : 'That did not go through. Try again.');
      } finally {
        setBusy(false);
      }
    },
    [raw, images, capture, toast, onClose],
  );

  return (
    <Sheet open={open} onClose={onClose} title="Drop it in.">
      {duplicate ? (
        <DuplicateCard
          hit={duplicate}
          onAddAnyway={() => {
            setDuplicate(null);
            void submitSmart(true);
          }}
          onSkip={() => {
            setDuplicate(null);
            toast.push({ message: 'Good catch — skipped.' });
            onClose();
          }}
        />
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            <ModeTab active={mode === 'smart'} onClick={() => setMode('smart')}>
              Smart
            </ModeTab>
            <ModeTab active={mode === 'manual'} onClick={() => setMode('manual')}>
              By hand
            </ModeTab>
          </div>

          {mode === 'smart' ? (
            <div className="flex flex-col gap-4">
              <Textarea
                ref={textareaRef}
                rows={5}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder="Paste a link. Or type the thought. Either works."
                data-testid="capture-input"
                aria-label="What are you dropping in?"
              />

              <MicButton value={raw} onText={setRaw} disabled={busy} />

              {platform && isWalled(platform) ? (
                <p className="rounded-2xl border border-line bg-raised px-3.5 py-2.5 text-xs text-muted">
                  Instagram will not let us read that post. Paste the caption too and we will file
                  it properly.
                </p>
              ) : null}

              <ImagePicker images={images} onChange={setImages} guest={guest} />

              {error ? (
                <p role="alert" className="text-sm text-red">
                  {error}
                </p>
              ) : null}

              <Button full busy={busy} onClick={() => void submitSmart()} data-testid="capture-submit">
                Drop it in
              </Button>

              <p className="text-center text-xs text-faint">Organize it for me.</p>
            </div>
          ) : (
            <ManualForm
              groups={groups.map((g) => ({ id: g.id, name: g.name }))}
              busy={busy}
              onSubmit={async (values) => {
                setBusy(true);
                setError(null);
                try {
                  await captureManual({
                    ...values,
                    summary: '',
                    note: '',
                    tags: [],
                    source: 'app',
                  });
                  toast.push({ message: 'Dropped.', tone: 'good' });
                  onClose();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'That did not save.');
                } finally {
                  setBusy(false);
                }
              }}
              error={error}
            />
          )}
        </>
      )}
    </Sheet>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-pill px-3.5 py-1.5 font-mono text-[0.625rem] uppercase tracking-eyebrow transition-colors ${
        active ? 'bg-champagne-tint text-champagne' : 'text-faint hover:text-muted'
      }`}
    >
      {children}
    </button>
  );
}

interface ManualValues {
  title: string;
  type: ItemType;
  state: 'inbox' | 'todo';
  groupId?: string;
  priority: 1 | 2 | 3 | null;
  dueAt: string | null;
  url: string | null;
}

function ManualForm({
  groups,
  busy,
  error,
  onSubmit,
}: {
  groups: { id: string; name: string }[];
  busy: boolean;
  error: string | null;
  onSubmit: (values: ManualValues) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ItemType>('note');
  const [groupId, setGroupId] = useState<string>('');
  const [priority, setPriority] = useState<string>('');
  const [due, setDue] = useState('');
  const [url, setUrl] = useState('');

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({
          title: title.trim(),
          type,
          state: type === 'task' ? 'todo' : 'inbox',
          ...(groupId ? { groupId } : {}),
          priority: priority ? (Number(priority) as 1 | 2 | 3) : null,
          dueAt: due ? new Date(`${due}T09:00:00`).toISOString() : null,
          url: url.trim() || null,
        });
      }}
    >
      <Field label="title">
        {({ id }) => (
          <Input
            id={id}
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What is it?"
          />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="type">
          {({ id }) => (
            <select
              id={id}
              value={type}
              onChange={(e) => setType(e.target.value as ItemType)}
              className="w-full rounded-2xl border border-line bg-raised px-3.5 py-3 text-text"
            >
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="group">
          {({ id }) => (
            <select
              id={id}
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full rounded-2xl border border-line bg-raised px-3.5 py-3 text-text"
            >
              <option value="">Unfiled</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="priority">
          {({ id }) => (
            <select
              id={id}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-2xl border border-line bg-raised px-3.5 py-3 text-text"
            >
              <option value="">None</option>
              <option value="1">P1</option>
              <option value="2">P2</option>
              <option value="3">P3</option>
            </select>
          )}
        </Field>

        <Field label="due">
          {({ id }) => (
            <Input id={id} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          )}
        </Field>
      </div>

      <Field label="link">
        {({ id }) => (
          <Input
            id={id}
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
          />
        )}
      </Field>

      {error ? (
        <p role="alert" className="text-sm text-red">
          {error}
        </p>
      ) : null}

      <Button type="submit" full busy={busy} disabled={!title.trim()}>
        Save it
      </Button>
    </form>
  );
}

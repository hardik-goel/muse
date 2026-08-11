'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Group, Item, ItemState, Profile, UserSettings, UserStats } from '@/lib/types';
import type { CaptureResult, StoreAdapter } from '@/lib/store/adapter';
import type { CaptureInput, ItemPatchInput, ManualCaptureInput } from '@/lib/zod-schemas';
import { ApiAdapter } from '@/lib/store/api-adapter';
import { MemoryAdapter } from '@/lib/store/memory-adapter';
import { asItems, readGuestSession } from '@/lib/guest';
import { enqueue, flushOutbox, isOffline, outboxSize } from '@/lib/outbox';
import { classifyLocal } from '@/lib/local-mode';
import { detectPlatform, extractUrl, normaliseUrl, thumbnailFor } from '@/lib/url';
import { uid } from '@/lib/utils';

/** The tab's saved guest work, shaped for the store. Empty when there is none. */
function guestSeed(): { items: Item[]; groups: Group[] } | null {
  const saved = readGuestSession();
  if (!saved) return null;
  return { items: asItems(saved.items), groups: saved.groups };
}

/**
 * What an offline drop looks like on screen until it reaches the server. It is
 * classified by the same Local-mode functions the server would have used, so
 * the card does not visibly change when the real row arrives.
 */
function offlineDraft(clientId: string, input: CaptureInput, userId: string): Item {
  const raw = input.raw.trim();
  const url = extractUrl(raw);
  const local = classifyLocal(raw);
  const now = new Date().toISOString();

  return {
    id: clientId,
    user_id: userId,
    group_id: null,
    title: local.title,
    summary: local.summary,
    note: '',
    raw_input: raw,
    type: local.type,
    state: local.state,
    priority: local.priority,
    tags: local.tags,
    due_at: null,
    url,
    url_normalized: normaliseUrl(url),
    platform: detectPlatform(url),
    thumb_url: input.thumbPath ?? thumbnailFor(url),
    source: input.source,
    ai_status: 'pending',
    created_at: now,
    updated_at: now,
    done_at: null,
    touched_at: now,
  };
}
import { useToast } from '@/components/ui/Toast';

export interface SessionInfo {
  guest: boolean;
  profile: Profile | null;
  settings: UserSettings | null;
  stats: UserStats | null;
  flags: Record<string, boolean>;
  /** True when AI features are both purchased and switched on. */
  aiActive: boolean;
}

interface StoreValue extends SessionInfo {
  items: Item[];
  groups: Group[];
  loading: boolean;
  error: string | null;

  reload: () => Promise<void>;
  capture: (input: CaptureInput) => Promise<CaptureResult>;
  captureManual: (input: ManualCaptureInput) => Promise<Item>;
  patchItem: (id: string, patch: ItemPatchInput) => Promise<Item | null>;
  setState: (id: string, state: ItemState) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  createGroup: (name: string) => Promise<Group | null>;
  groupName: (id: string | null) => string;
}

const StoreContext = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

export function StoreProvider({
  session,
  initial,
  children,
}: {
  session: SessionInfo;
  initial?: { items: Item[]; groups: Group[] };
  children: ReactNode;
}) {
  const toast = useToast();

  // Guest mode picks up whatever the tab already holds, so a reload inside the
  // session does not wipe the work before the user has decided to sign up.
  const adapterRef = useRef<StoreAdapter>(
    session.guest ? new MemoryAdapter(guestSeed() ?? { items: [], groups: [] }) : new ApiAdapter(),
  );

  const [items, setItems] = useState<Item[]>(initial?.items ?? []);
  const [groups, setGroups] = useState<Group[]>(initial?.groups ?? []);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await adapterRef.current.load();
      setItems(snapshot.items);
      setGroups(snapshot.groups);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initial) void reload();
    // Guest mode hydrates synchronously from the adapter's seed.
    if (session.guest && !initial) {
      const seeded = guestSeed();
      if (seeded) {
        setItems(seeded.items);
        setGroups(seeded.groups);
        setLoading(false);
      }
    }
  }, [initial, reload, session.guest]);

  const capture = useCallback(
    async (input: CaptureInput): Promise<CaptureResult> => {
      let result: CaptureResult;

      try {
        result = await adapterRef.current.capture(input);
      } catch (error) {
        // Capture is the one action that must never fail. With no network the
        // drop is queued, shown immediately, and replayed when we are back.
        if (!isOffline(error) || session.guest) throw error;

        const clientId = uid();
        enqueue({ clientId, input, queuedAt: new Date().toISOString() });

        const pending = offlineDraft(clientId, input, session.profile?.id ?? '');
        setItems((current) => [pending, ...current]);
        return { item: pending };
      }

      if (result.item) {
        const created = result.item;
        setItems((current) => [created, ...current.filter((i) => i.id !== created.id)]);
        // A capture can mint a group; refresh the list cheaply rather than guess.
        void adapterRef.current
          .load()
          .then((snapshot) => {
            setGroups(snapshot.groups);
            setItems(snapshot.items);
          })
          .catch(() => undefined);
      }
      return result;
    },
    [session.guest, session.profile?.id],
  );

  /**
   * Replays anything captured offline: once on mount, and again whenever the
   * browser says the connection is back.
   */
  useEffect(() => {
    if (session.guest) return;

    let cancelled = false;

    const flush = async () => {
      if (outboxSize() === 0) return;
      const result = await flushOutbox(adapterRef.current);
      if (cancelled || result.sent === 0) return;

      await reload();
      toast.push({
        message: `${result.sent} ${result.sent === 1 ? 'drop' : 'drops'} synced.`,
        tone: 'good',
      });
    };

    void flush();
    window.addEventListener('online', flush);
    return () => {
      cancelled = true;
      window.removeEventListener('online', flush);
    };
  }, [session.guest, reload, toast]);

  const captureManual = useCallback(async (input: ManualCaptureInput): Promise<Item> => {
    const item = await adapterRef.current.captureManual(input);
    setItems((current) => [item, ...current]);
    const snapshot = await adapterRef.current.load().catch(() => null);
    if (snapshot) setGroups(snapshot.groups);
    return item;
  }, []);

  /**
   * Optimistic with a real rollback. The previous row is held so a failed write
   * restores exactly what was on screen rather than an approximation.
   */
  const patchItem = useCallback(
    async (id: string, patch: ItemPatchInput): Promise<Item | null> => {
      const previous = items.find((i) => i.id === id);
      if (!previous) return null;

      const optimistic: Item = {
        ...previous,
        ...(patch.title !== undefined && { title: patch.title }),
        ...(patch.summary !== undefined && { summary: patch.summary }),
        ...(patch.note !== undefined && { note: patch.note }),
        ...(patch.type !== undefined && { type: patch.type }),
        ...(patch.state !== undefined && { state: patch.state }),
        ...(patch.tags !== undefined && { tags: patch.tags }),
        ...(patch.priority !== undefined && { priority: patch.priority }),
        ...(patch.dueAt !== undefined && { due_at: patch.dueAt }),
        ...(patch.groupId !== undefined && { group_id: patch.groupId }),
        updated_at: new Date().toISOString(),
        touched_at: new Date().toISOString(),
      };
      setItems((current) => current.map((i) => (i.id === id ? optimistic : i)));

      try {
        const saved = await adapterRef.current.patch(id, patch);
        setItems((current) => current.map((i) => (i.id === id ? saved : i)));
        return saved;
      } catch (err) {
        setItems((current) => current.map((i) => (i.id === id ? previous : i)));
        toast.push({
          message: err instanceof Error ? err.message : 'That did not save.',
          tone: 'bad',
        });
        return null;
      }
    },
    [items, toast],
  );

  const setState = useCallback(
    async (id: string, state: ItemState) => {
      const previous = items.find((i) => i.id === id);
      if (!previous) return;

      await patchItem(id, { state });

      // Every state change is undoable for five seconds.
      toast.push({
        message: state === 'done' ? 'Done.' : `Moved to ${state}.`,
        tone: state === 'done' ? 'good' : 'neutral',
        undo: async () => {
          await patchItem(id, { state: previous.state });
        },
      });
    },
    [items, patchItem, toast],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      const previous = items.find((i) => i.id === id);
      if (!previous) return;

      setItems((current) => current.filter((i) => i.id !== id));
      try {
        await adapterRef.current.remove(id);
      } catch (err) {
        setItems((current) => [previous, ...current]);
        toast.push({
          message: err instanceof Error ? err.message : 'That did not delete.',
          tone: 'bad',
        });
        return;
      }

      toast.push({
        message: 'Deleted.',
        undo: async () => {
          try {
            const restored = await adapterRef.current.restore(id);
            setItems((current) => [restored, ...current.filter((i) => i.id !== id)]);
          } catch {
            toast.push({ message: 'Could not bring that back.', tone: 'bad' });
          }
        },
      });
    },
    [items, toast],
  );

  const createGroup = useCallback(
    async (name: string): Promise<Group | null> => {
      try {
        const group = await adapterRef.current.createGroup(name);
        setGroups((current) =>
          current.some((g) => g.id === group.id) ? current : [...current, group],
        );
        return group;
      } catch (err) {
        toast.push({
          message: err instanceof Error ? err.message : 'Could not make that group.',
          tone: 'bad',
        });
        return null;
      }
    },
    [toast],
  );

  const groupName = useCallback(
    (id: string | null) => groups.find((g) => g.id === id)?.name ?? 'Unfiled',
    [groups],
  );

  const value = useMemo<StoreValue>(
    () => ({
      ...session,
      items,
      groups,
      loading,
      error,
      reload,
      capture,
      captureManual,
      patchItem,
      setState,
      deleteItem,
      createGroup,
      groupName,
    }),
    [
      session,
      items,
      groups,
      loading,
      error,
      reload,
      capture,
      captureManual,
      patchItem,
      setState,
      deleteItem,
      createGroup,
      groupName,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

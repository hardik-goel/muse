import { z } from 'zod';
import { CAPTURE_SOURCES, ITEM_STATES, ITEM_TYPES } from '@/lib/types';

/**
 * Every API input is parsed through one of these. No route reads req.json()
 * without a schema — that is the rule the security review checks for.
 */

export const zItemType = z.enum(ITEM_TYPES);
export const zItemState = z.enum(ITEM_STATES);
export const zCaptureSource = z.enum(CAPTURE_SOURCES);
export const zPriority = z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable();
export const zUuid = z.string().uuid();

const zTags = z.array(z.string().trim().min(1).max(32)).max(8);

export const zCapture = z.object({
  /** Exactly what the user pasted or typed. Never lost, never rewritten. */
  raw: z.string().trim().min(1, 'Drop something in first.').max(20_000),
  source: zCaptureSource.default('app'),
  /** Client-side upload result: storage paths for images already in the bucket. */
  thumbPath: z.string().max(400).optional(),
  /** Set when the user chose "Add anyway" on a duplicate warning. */
  force: z.boolean().default(false),
  /** Guest-mode and offline replays carry their own id so retries are idempotent. */
  clientId: z.string().max(64).optional(),
});

export const zManualCapture = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(400).default(''),
  note: z.string().max(20_000).default(''),
  type: zItemType.default('note'),
  state: zItemState.default('inbox'),
  groupName: z.string().trim().max(60).optional(),
  groupId: zUuid.optional(),
  tags: zTags.default([]),
  priority: zPriority.default(null),
  dueAt: z.string().datetime({ offset: true }).nullable().default(null),
  url: z.string().url().max(2000).nullable().default(null),
  source: zCaptureSource.default('app'),
  thumbPath: z.string().max(400).optional(),
});

export const zItemPatch = z
  .object({
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().max(400),
    note: z.string().max(20_000),
    type: zItemType,
    state: zItemState,
    groupId: zUuid.nullable(),
    groupName: z.string().trim().max(60),
    tags: zTags,
    priority: zPriority,
    dueAt: z.string().datetime({ offset: true }).nullable(),
    url: z.string().url().max(2000).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update.' });

export const zBulkAction = z.object({
  ids: z.array(zUuid).min(1).max(200),
  action: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('state'), state: zItemState }),
    z.object({ kind: z.literal('group'), groupId: zUuid.nullable() }),
    z.object({ kind: z.literal('delete') }),
  ]),
});

export const zItemsQuery = z.object({
  q: z.string().trim().max(200).optional(),
  group: zUuid.optional(),
  state: z.union([zItemState, z.literal('active'), z.literal('all')]).default('active'),
  type: z.union([zItemType, z.literal('all')]).default('all'),
  sort: z.enum(['score', 'newest', 'oldest', 'due']).default('score'),
  /** Cursor pagination on (updated_at, id). */
  cursor: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const zGroupCreate = z.object({
  name: z.string().trim().min(1).max(60),
});

export const zGroupPatch = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const zSettingsPatch = z
  .object({
    aiEnabled: z.boolean(),
    notifMaster: z.boolean(),
    notifPrefs: z
      .object({
        morning_brief: z.boolean(),
        workout: z.boolean(),
        review_due: z.boolean(),
        streak_guard: z.boolean(),
        email_digest: z.boolean(),
      })
      .partial(),
    briefTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM'),
    timezone: z.string().min(1).max(64),
    workoutEnabled: z.boolean(),
    workoutSplit: z.array(z.string().trim().max(40)).length(7),
    workoutWhy: z.string().max(280),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update.' });

export const zOnboarding = z.object({
  interests: z.array(z.string().max(32)).max(16).default([]),
  trains: z.boolean().default(false),
  why: z.string().trim().max(280).default(''),
  timezone: z.string().min(1).max(64).optional(),
});

export const zChecklistPatch = z.object({
  key: z.enum(['first_drop', 'first_done', 'first_review', 'install_app', 'enable_notifications']),
  value: z.boolean().default(true),
});

export const zAsk = z.object({
  question: z.string().trim().min(2).max(500),
});

export const zReviewDecision = z.object({
  itemId: zUuid,
  decision: z.enum(['todo', 'someday', 'let_go', 'keep']),
});

export const zReviewComplete = z.object({
  decisions: z.number().int().min(0).max(1000),
});

export const zArchiveDecision = z.object({
  itemId: zUuid,
  decision: z.enum(['still_matters', 'someday', 'let_go']),
});

export const zFocusStart = z.object({
  itemId: zUuid.nullable().default(null),
  minutes: z.union([z.literal(15), z.literal(25), z.literal(50)]),
});

export const zFocusEnd = z.object({
  sessionId: zUuid,
  completed: z.boolean(),
});

export const zFeedback = z.object({
  text: z.string().trim().min(1).max(4000),
});

export const zEventBatch = z.object({
  events: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(64),
        props: z.record(z.unknown()).default({}),
      }),
    )
    .min(1)
    .max(50),
});

export const zPushSubscribe = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(400),
    auth: z.string().min(1).max(400),
  }),
});

export const zCaptureTokenCreate = z.object({
  label: z.string().trim().min(1).max(40).default('Siri'),
});

export const zTrashRestore = z.object({
  id: zUuid,
});

/** The export artifact this app writes, and the import format it accepts. */
export const zImport = z.object({
  version: z.number().int().min(1).default(1),
  exportedAt: z.string().optional(),
  groups: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().trim().min(1).max(60),
      }),
    )
    .default([]),
  items: z
    .array(
      z.object({
        id: z.string().optional(),
        title: z.string().max(200).default(''),
        summary: z.string().max(400).default(''),
        note: z.string().max(20_000).default('').optional(),
        raw: z.string().max(20_000).default('').optional(),
        type: z.string().max(32).default('note'),
        state: z.string().max(32).default('inbox'),
        group: z.string().max(60).nullable().default(null),
        tags: z.array(z.string().max(32)).max(16).default([]),
        priority: z.number().int().min(1).max(3).nullable().default(null),
        due: z.string().nullable().default(null),
        url: z.string().max(2000).nullable().default(null),
        platform: z.string().max(32).nullable().default(null),
        // The prototype exported base64 thumbs; these are re-hosted in Storage.
        thumb: z.string().max(4_000_000).nullable().default(null),
        createdAt: z.string().nullable().default(null),
        doneAt: z.string().nullable().default(null),
      }),
    )
    .max(5000)
    .default([]),
  settings: z.record(z.unknown()).optional(),
});

export type CaptureInput = z.infer<typeof zCapture>;
export type ManualCaptureInput = z.infer<typeof zManualCapture>;
export type ItemPatchInput = z.infer<typeof zItemPatch>;
export type ItemsQuery = z.infer<typeof zItemsQuery>;
export type ImportPayload = z.infer<typeof zImport>;

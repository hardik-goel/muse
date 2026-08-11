import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ZodTypeAny, output } from 'zod';
import { serverEnv } from '@/lib/env';
import { log, errorFields } from '@/lib/logger';
import { ApiError } from '@/lib/api';

/**
 * The only place Anthropic is called from.
 *
 * Three guarantees hold for every feature that goes through here:
 *   1. A missing key or MOCK_AI=true never breaks a route — the caller's
 *      deterministic Local-mode fallback is returned instead.
 *   2. Every call is metered against a per-user daily budget before it is made,
 *      and written to ai_usage_log after.
 *   3. Malformed JSON is retried once, then falls back. The product never shows
 *      an AI error; it shows the Local-mode answer.
 */

export type AiFeature = 'classify' | 'current' | 'ask' | 'brief' | 'reflect' | 'threads' | 'embed';

type Db = SupabaseClient;

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: serverEnv.anthropicKey, maxRetries: 1 });
  return client;
}

export class AiUnavailableError extends Error {
  constructor(readonly reason: 'no-key' | 'budget' | 'failed') {
    super(`AI unavailable: ${reason}`);
    this.name = 'AiUnavailableError';
  }
}

/** Calls made today, counted against the plan's ceiling. */
export async function remainingBudget(
  db: Db,
  userId: string,
  plan: 'free' | 'intelligence',
): Promise<number> {
  const ceiling = plan === 'intelligence' ? serverEnv.aiBudget.paid : serverEnv.aiBudget.free;
  const since = new Date(Date.now() - 86_400_000).toISOString();

  const { count, error } = await db
    .from('ai_usage_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since);

  // A broken counter must not hand out unlimited spend, nor block a paying
  // user. Assume half the budget is gone and carry on.
  if (error) return Math.floor(ceiling / 2);
  return Math.max(0, ceiling - (count ?? 0));
}

async function recordUsage(
  db: Db,
  userId: string,
  feature: AiFeature,
  model: string,
  inputTokens: number,
  outputTokens: number,
  ok: boolean,
): Promise<void> {
  const { error } = await db.from('ai_usage_log').insert({
    user_id: userId,
    feature,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    ok,
  });
  if (error) log.warn('ai usage not recorded', { userId, feature, ...errorFields(error) });
}

/**
 * Feature names and env model slots are not one-to-one — The Current is
 * `current` in the product and `prioritize` in the configuration.
 */
function modelFor(feature: AiFeature): string {
  const models = serverEnv.models;
  switch (feature) {
    case 'current':
      return models.prioritize;
    case 'embed':
    case 'classify':
      return models.classify;
    default:
      return models[feature];
  }
}

export interface AiCallOptions<S extends ZodTypeAny> {
  db: Db;
  userId: string;
  plan: 'free' | 'intelligence';
  feature: AiFeature;
  system: string;
  prompt: string;
  schema: S;
  maxTokens?: number;
  /** Deterministic answer used when AI is off, over budget, or broken. */
  fallback: () => output<S>;
}

/** Pulls the first JSON object or array out of a model response. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? text).trim();

  const start = body.search(/[[{]/);
  if (start === -1) throw new Error('No JSON in response');

  const opener = body[start];
  const closer = opener === '{' ? '}' : ']';
  const end = body.lastIndexOf(closer);
  if (end <= start) throw new Error('Unterminated JSON in response');

  return JSON.parse(body.slice(start, end + 1));
}

/**
 * One structured call. Returns `{ value, degraded }` — `degraded` is true
 * whenever the answer came from the fallback rather than the model, which the
 * UI surfaces as the quiet "local mode" label.
 */
export async function callJson<S extends ZodTypeAny>(
  options: AiCallOptions<S>,
): Promise<{ value: output<S>; degraded: boolean }> {
  const { db, userId, plan, feature, system, prompt, schema, fallback, maxTokens = 700 } = options;

  if (serverEnv.mockAi) {
    return { value: fallback(), degraded: true };
  }

  const budget = await remainingBudget(db, userId, plan);
  if (budget <= 0) {
    log.warn('ai budget exhausted', { userId, feature });
    return { value: fallback(), degraded: true };
  }

  const model = modelFor(feature);
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await anthropic().messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [
          {
            role: 'user',
            content:
              attempt === 0
                ? prompt
                : `${prompt}\n\nYour previous reply was not valid JSON. Reply with the JSON object only — no prose, no code fence.`,
          },
        ],
      });

      const text = response.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('')
        .trim();

      const parsed = schema.parse(extractJson(text));

      await recordUsage(
        db,
        userId,
        feature,
        model,
        response.usage.input_tokens,
        response.usage.output_tokens,
        true,
      );

      return { value: parsed, degraded: false };
    } catch (err) {
      lastError = err;
      // Auth, rate-limit and overload errors will not be fixed by a reformat
      // instruction — stop early and fall back.
      if (err instanceof Anthropic.APIError && err.status !== 400) break;
    }
  }

  await recordUsage(db, userId, feature, model, 0, 0, false);
  log.warn('ai call failed, using local fallback', { userId, feature, ...errorFields(lastError) });
  return { value: fallback(), degraded: true };
}

/** Guards the AI-only routes. Free plan and lapsed subscriptions land here. */
export function requireAi(active: boolean): void {
  if (!active) throw new ApiError(402, 'Intelligence is not switched on.');
}

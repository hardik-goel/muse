/**
 * Central environment access.
 *
 * Rule enforced here and verified by `npm run secret-grep` in CI: anything that
 * is not prefixed NEXT_PUBLIC_ must only ever be read from server code. This
 * module is safe to import from the server; `publicEnv` is the only export a
 * client component may touch.
 */

const bool = (v: string | undefined, fallback = false): boolean => {
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1';
};

const int = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
  razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? '',
  priceIntelligenceInr: int(process.env.NEXT_PUBLIC_PRICE_INTELLIGENCE_INR, 299),
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? '',
} as const;

export const serverEnv = {
  get serviceRoleKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  },
  get anthropicKey() {
    return process.env.ANTHROPIC_API_KEY ?? '';
  },
  /**
   * MOCK_AI returns deterministic fixtures instead of calling Anthropic.
   * It is forced on whenever no API key is present, so a fresh clone runs.
   */
  get mockAi() {
    return bool(process.env.MOCK_AI, false) || !process.env.ANTHROPIC_API_KEY;
  },
  get models() {
    return {
      classify: process.env.ANTHROPIC_MODEL_CLASSIFY ?? 'claude-sonnet-4-6',
      brief: process.env.ANTHROPIC_MODEL_BRIEF ?? 'claude-sonnet-4-6',
      ask: process.env.ANTHROPIC_MODEL_ASK ?? 'claude-sonnet-4-6',
      prioritize: process.env.ANTHROPIC_MODEL_PRIORITIZE ?? 'claude-sonnet-4-6',
      reflect: process.env.ANTHROPIC_MODEL_REFLECT ?? 'claude-sonnet-4-6',
      threads: process.env.ANTHROPIC_MODEL_THREADS ?? 'claude-sonnet-4-6',
    };
  },
  get embeddings() {
    return {
      provider: process.env.EMBEDDINGS_PROVIDER ?? 'voyage',
      model: process.env.EMBEDDINGS_MODEL ?? 'voyage-3-lite',
      dimension: int(process.env.EMBEDDINGS_DIMENSION, 1024),
      voyageKey: process.env.VOYAGE_API_KEY ?? '',
    };
  },
  get aiBudget() {
    return {
      paid: int(process.env.AI_DAILY_BUDGET_PAID, 50),
      free: int(process.env.AI_DAILY_BUDGET_FREE, 10),
    };
  },
  get rateLimits() {
    return {
      general: int(process.env.RATE_LIMIT_GENERAL, 60),
      ai: int(process.env.RATE_LIMIT_AI, 10),
      captureToken: int(process.env.RATE_LIMIT_CAPTURE_TOKEN, 30),
    };
  },
  get upstash() {
    return {
      url: process.env.UPSTASH_REDIS_REST_URL ?? '',
      token: process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
    };
  },
  get vapid() {
    return {
      publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
      privateKey: process.env.VAPID_PRIVATE_KEY ?? '',
      subject: process.env.VAPID_SUBJECT ?? 'mailto:hello@muse.app',
    };
  },
  get cronSecret() {
    return process.env.CRON_SECRET ?? '';
  },
  get razorpay() {
    return {
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? '',
      keySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
      planId: process.env.RAZORPAY_PLAN_ID_INTELLIGENCE ?? '',
    };
  },
  get google() {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirectUri:
        process.env.GOOGLE_OAUTH_REDIRECT_URI ??
        `${publicEnv.appUrl}/api/calendar/callback`,
    };
  },
  get email() {
    return {
      resendKey: process.env.RESEND_API_KEY ?? '',
      from: process.env.EMAIL_FROM ?? 'Muse <hello@muse.app>',
    };
  },
  get adminEmails(): string[] {
    return (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  },
  get defaults() {
    return {
      timezone: process.env.DEFAULT_TIMEZONE ?? 'Asia/Kolkata',
      briefTime: process.env.DEFAULT_BRIEF_TIME ?? '07:30',
      trashRetentionDays: int(process.env.TRASH_RETENTION_DAYS, 30),
    };
  },
} as const;

export const isProd = process.env.NODE_ENV === 'production';
export const flagEnv = isProd ? 'production' : 'development';

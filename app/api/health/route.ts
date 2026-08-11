import { NextResponse } from 'next/server';
import { publicEnv, serverEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Liveness + configuration probe. Reports whether optional subsystems are
 * wired, never the values that wire them.
 */
export async function GET() {
  const body = {
    status: 'ok' as const,
    time: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    config: {
      supabase: Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey),
      anthropic: Boolean(serverEnv.anthropicKey),
      mockAi: serverEnv.mockAi,
      embeddings: Boolean(serverEnv.embeddings.voyageKey),
      push: Boolean(serverEnv.vapid.publicKey && serverEnv.vapid.privateKey),
      billing: Boolean(serverEnv.razorpay.keySecret),
      email: Boolean(serverEnv.email.resendKey),
    },
  };

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

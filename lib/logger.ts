/**
 * Structured JSON logging for API routes.
 * One line per event so Vercel's log drain stays parseable. Never log secrets,
 * raw tokens, or full user content — only ids, counts and durations.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

interface LogFields {
  route?: string;
  userId?: string;
  status?: number;
  durationMs?: number;
  feature?: string;
  [key: string]: unknown;
}

function emit(level: Level, message: string, fields: LogFields = {}): void {
  const line = JSON.stringify({
    level,
    message,
    ts: new Date().toISOString(),
    ...fields,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (m: string, f?: LogFields) => {
    if (process.env.NODE_ENV !== 'production') emit('debug', m, f);
  },
  info: (m: string, f?: LogFields) => emit('info', m, f),
  warn: (m: string, f?: LogFields) => emit('warn', m, f),
  error: (m: string, f?: LogFields) => emit('error', m, f),
};

/** Normalises an unknown throwable into a safe, loggable shape. */
export function errorFields(err: unknown): LogFields {
  if (err instanceof Error) {
    return { error: err.message, errorName: err.name };
  }
  return { error: String(err) };
}

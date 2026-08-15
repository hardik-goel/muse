/**
 * Turns whatever the auth client threw into something a person can act on.
 *
 * Supabase surfaces the browser's own failure text verbatim, so a dropped
 * mobile connection reaches the user as "Load failed" — which reads like the
 * product is broken and gives no hint that trying again would work. Anything
 * not recognised here is passed through unchanged rather than replaced with a
 * vague catch-all, so a genuinely informative message is never swallowed.
 */
export function signUpErrorMessage(raw: string): string {
  const message = raw.trim();

  // Safari says "Load failed", Chrome "Failed to fetch", Firefox "NetworkError
  // when attempting to fetch resource". All three mean the same thing.
  if (/load failed|failed to fetch|networkerror|network request failed/i.test(message)) {
    return 'Could not reach the server. Check your connection and try again.';
  }

  if (/rate limit|too many requests/i.test(message)) {
    return 'Too many sign-ups from this app in the last hour. Try again shortly.';
  }

  if (/already registered|already exists|user already/i.test(message)) {
    return 'That email already has an account. Try signing in instead.';
  }

  if (/invalid.*email|email address.*invalid/i.test(message)) {
    return 'That email address does not look right.';
  }

  if (/password/i.test(message) && /weak|short|least/i.test(message)) {
    return 'That password is not strong enough. Try a longer one with a symbol in it.';
  }

  return message;
}

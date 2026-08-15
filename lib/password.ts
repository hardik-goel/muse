/**
 * Password rules for signup.
 *
 * Deliberately checked in the browser as the user types rather than thrown back
 * after a round trip: the point is to stop a weak password being chosen, not to
 * scold someone for having chosen one. The server enforces its own minimum
 * independently — this is a guide, not the gate.
 *
 * Pure and I/O-free so it can be unit tested and reused anywhere a password is
 * set, including a future reset-password screen.
 */

export const MIN_PASSWORD_LENGTH = 10;

export interface PasswordRule {
  id: string;
  label: string;
  passed: boolean;
}

export type PasswordVerdict = 'weak' | 'fair' | 'strong';

export interface PasswordAssessment {
  rules: PasswordRule[];
  /** Every rule satisfied — the submit button waits on this. */
  ok: boolean;
  /** How many rules passed, for the meter. */
  met: number;
  verdict: PasswordVerdict;
  /** One line naming what is still missing, for the screen reader and the form. */
  summary: string;
}

/** A handful of passwords that meet every rule and are still worthless. */
const OBVIOUS = [/^password/i, /^qwerty/i, /^letmein/i, /^welcome/i, /^admin/i, /^123456/];

export function assessPassword(password: string): PasswordAssessment {
  const rules: PasswordRule[] = [
    {
      id: 'length',
      label: `${MIN_PASSWORD_LENGTH} characters or more`,
      passed: password.length >= MIN_PASSWORD_LENGTH,
    },
    { id: 'lower', label: 'a lowercase letter', passed: /[a-z]/.test(password) },
    { id: 'upper', label: 'an uppercase letter', passed: /[A-Z]/.test(password) },
    { id: 'number', label: 'a number', passed: /\d/.test(password) },
    {
      id: 'symbol',
      label: 'a special character',
      // Anything that is not a letter, a digit or whitespace. Spelling out a
      // list would quietly reject perfectly good symbols from other keyboards.
      passed: /[^\p{L}\p{N}\s]/u.test(password),
    },
    {
      id: 'notobvious',
      label: 'not a guessable favourite',
      passed: password.length > 0 && !OBVIOUS.some((re) => re.test(password)),
    },
  ];

  const met = rules.filter((r) => r.passed).length;
  const ok = met === rules.length;

  return {
    rules,
    ok,
    met,
    verdict: ok ? 'strong' : met >= 4 ? 'fair' : 'weak',
    summary: summarise(rules, ok, password),
  };
}

function summarise(rules: PasswordRule[], ok: boolean, password: string): string {
  if (!password) return '';
  if (ok) return 'Strong password.';

  const missing = rules.filter((r) => !r.passed).map((r) => r.label);
  if (missing.length === 1) return `Still needs ${missing[0]}.`;

  const last = missing[missing.length - 1];
  return `Still needs ${missing.slice(0, -1).join(', ')} and ${last}.`;
}

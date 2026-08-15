'use client';

import type { PasswordAssessment } from '@/lib/password';

/**
 * The live read-out under the password field.
 *
 * Shows nothing at all until something has been typed — an empty box lectured
 * about six unmet requirements is hostile on the first screen of a product.
 * Once typing starts it says what is still missing rather than only that the
 * password is bad, because "weak" without "needs a special character" leaves
 * the user guessing.
 */
export function PasswordStrength({ assessment }: { assessment: PasswordAssessment }) {
  const { rules, met, verdict, summary } = assessment;
  const total = rules.length;

  if (!summary) return null;

  const tone =
    verdict === 'strong'
      ? 'text-green'
      : verdict === 'fair'
        ? 'text-champagne'
        : 'text-red';

  return (
    <div className="flex flex-col gap-2" data-testid="password-strength">
      <div className="flex gap-1" aria-hidden="true">
        {rules.map((rule, index) => (
          <span
            key={rule.id}
            className={`h-1 flex-1 rounded-pill transition-colors ${
              index < met
                ? verdict === 'strong'
                  ? 'bg-green'
                  : verdict === 'fair'
                    ? 'bg-champagne'
                    : 'bg-red'
                : 'bg-line'
            }`}
          />
        ))}
      </div>

      <p
        // Announced as it changes, so this works without seeing the bars.
        aria-live="polite"
        data-testid="password-summary"
        className={`text-xs ${tone}`}
      >
        {summary}
      </p>

      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {rules.map((rule) => (
          <li
            key={rule.id}
            className={`text-[0.6875rem] ${rule.passed ? 'text-faint line-through' : 'text-muted'}`}
          >
            {rule.passed ? '✓' : '·'} {rule.label}
          </li>
        ))}
      </ul>

      <span className="sr-only">
        {met} of {total} requirements met.
      </span>
    </div>
  );
}

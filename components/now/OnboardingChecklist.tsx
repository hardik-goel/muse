'use client';

import { useState } from 'react';
import { useStore } from '@/components/shell/StoreProvider';
import { CHECKLIST_STEPS, type ChecklistState } from '@/lib/types';

/**
 * Five things that make the product actually work, shown until all five are
 * done and then never again. Installing the app and enabling nudges are the
 * two that people skip and later wish they had not.
 */
export function OnboardingChecklist() {
  const { profile } = useStore();
  const [checklist, setChecklist] = useState<ChecklistState>(profile?.checklist ?? {});

  const done = CHECKLIST_STEPS.filter((step) => checklist[step.key]).length;
  if (done >= CHECKLIST_STEPS.length) return null;

  async function mark(key: keyof ChecklistState) {
    setChecklist((current) => ({ ...current, [key]: true }));
    await fetch('/api/profile/checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: true }),
    }).catch(() => undefined);
  }

  return (
    <section className="card px-5 py-5" data-testid="onboarding-checklist">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">getting set up</p>
        <span className="font-mono text-[0.625rem] text-faint">
          {done}/{CHECKLIST_STEPS.length}
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {CHECKLIST_STEPS.map((step) => {
          const complete = Boolean(checklist[step.key]);
          const actionable = step.key === 'install_app' || step.key === 'enable_notifications';

          return (
            <li key={step.key} className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[0.5625rem] ${
                  complete
                    ? 'border-green/40 bg-green-tint text-green'
                    : 'border-line text-transparent'
                }`}
              >
                ✓
              </span>
              <span className={`text-sm ${complete ? 'text-faint line-through' : 'text-soft'}`}>
                {step.label}
              </span>
              {!complete && actionable ? (
                <button
                  type="button"
                  onClick={() => void mark(step.key)}
                  className="ml-auto font-mono text-[0.625rem] uppercase tracking-eyebrow text-champagne"
                >
                  Done
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

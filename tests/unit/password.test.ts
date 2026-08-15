import { describe, expect, it } from 'vitest';
import { assessPassword, MIN_PASSWORD_LENGTH } from '@/lib/password';
import { signUpErrorMessage } from '@/lib/auth-errors';

const strong = 'Correct-Horse7';

describe('assessPassword', () => {
  it('accepts a password that meets every rule', () => {
    const result = assessPassword(strong);
    expect(result.ok).toBe(true);
    expect(result.verdict).toBe('strong');
    expect(result.summary).toBe('Strong password.');
  });

  it('names the missing special character rather than only saying weak', () => {
    const result = assessPassword('Longenough7');
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('special character');
  });

  it('rejects a password that is long but has no number or symbol', () => {
    const result = assessPassword('justlowercaseletters');
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('an uppercase letter');
    expect(result.summary).toContain('a number');
  });

  it(`requires at least ${MIN_PASSWORD_LENGTH} characters`, () => {
    expect(assessPassword('Ab3$xy').rules.find((r) => r.id === 'length')?.passed).toBe(false);
    expect(assessPassword(strong).rules.find((r) => r.id === 'length')?.passed).toBe(true);
  });

  it('turns down the obvious ones even when they satisfy the character rules', () => {
    const result = assessPassword('Password123!');
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('guessable');
  });

  it('counts a symbol from any keyboard, not a hardcoded list', () => {
    expect(assessPassword('Aabbccdd1€').rules.find((r) => r.id === 'symbol')?.passed).toBe(true);
    expect(assessPassword('Aabbccdd1、').rules.find((r) => r.id === 'symbol')?.passed).toBe(true);
  });

  it('says nothing at all about an empty box', () => {
    expect(assessPassword('').summary).toBe('');
  });

  it('reads as a sentence when several rules are unmet', () => {
    const summary = assessPassword('abc').summary;
    expect(summary.startsWith('Still needs ')).toBe(true);
    expect(summary).toMatch(/ and .+\.$/);
  });

  it('grades fair before strong so the meter moves as you type', () => {
    expect(assessPassword('abc').verdict).toBe('weak');
    expect(assessPassword('Abcdefgh12').verdict).toBe('fair');
    expect(assessPassword(strong).verdict).toBe('strong');
  });
});

describe('signUpErrorMessage', () => {
  it('translates every browser dialect of a dropped connection', () => {
    for (const raw of ['Load failed', 'Failed to fetch', 'NetworkError when attempting to fetch']) {
      expect(signUpErrorMessage(raw)).toBe(
        'Could not reach the server. Check your connection and try again.',
      );
    }
  });

  it('explains the email rate limit in terms of what to do', () => {
    expect(signUpErrorMessage('email rate limit exceeded')).toMatch(/try again shortly/i);
  });

  it('points an existing user at sign-in', () => {
    expect(signUpErrorMessage('User already registered')).toMatch(/signing in/i);
  });

  it('passes an unrecognised message through rather than burying it', () => {
    expect(signUpErrorMessage('Signups are disabled')).toBe('Signups are disabled');
  });
});

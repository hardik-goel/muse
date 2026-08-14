import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

/**
 * Dictation, against a stubbed recogniser.
 *
 * The real Web Speech API needs a microphone and, in Chrome, a round trip to
 * Google — neither belongs in a test. What is worth proving is ours: that the
 * button only appears where the browser can honour it, that speech lands in the
 * same box typing would, that it appends rather than overwrites, and that a
 * dictated thought drops like any other.
 */

/** Installs a fake recogniser that replays a scripted utterance on start(). */
async function stubRecogniser(
  page: import('@playwright/test').Page,
  utterance: { transcript: string; isFinal: boolean }[],
): Promise<void> {
  await page.addInitScript((script) => {
    class FakeRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        // Asynchronous, like the real thing: the component must handle results
        // that arrive after start() has already returned.
        setTimeout(() => {
          script.forEach((part, index) => {
            const results = Object.assign(
              [{ isFinal: part.isFinal, length: 1, 0: { transcript: part.transcript } }],
              { length: 1 },
            );
            this.onresult?.({ resultIndex: 0, results });
            if (index === script.length - 1) this.onend?.();
          });
        }, 10);
      }

      stop() {
        this.onend?.();
      }

      abort() {}
    }

    Object.defineProperty(window, 'SpeechRecognition', {
      value: FakeRecognition,
      configurable: true,
    });
  }, utterance);
}

test('the mic is not offered in a browser that cannot honour it', async ({ page }) => {
  await page.addInitScript(() => {
    // Firefox's position, reproduced: no recogniser of either name.
    Object.defineProperty(window, 'SpeechRecognition', {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: undefined,
      configurable: true,
    });
  });

  await openApp(page, '/guest/now');
  await page.getByTestId('drop-fab').click();

  await expect(page.getByTestId('capture-input')).toBeVisible();
  await expect(page.getByTestId('capture-mic')).toHaveCount(0);
});

test.describe('dictation', () => {
  test('speech lands in the capture box and drops like anything typed', async ({ page }) => {
    await stubRecogniser(page, [{ transcript: 'call the dentist tomorrow', isFinal: true }]);
    await openApp(page, '/guest/now');

    await page.getByTestId('drop-fab').click();
    await page.getByTestId('capture-mic').click();

    await expect(page.getByTestId('capture-input')).toHaveValue('call the dentist tomorrow');

    await page.getByTestId('capture-submit').click();
    await expect(page.getByTestId('capture-input')).toBeHidden();

    const card = page.getByTestId('item-card').first();
    await expect(card).toContainText('call the dentist');
    // "call" and "tomorrow" are task keywords; Local mode files it accordingly.
    await expect(card).toContainText('Personal');
  });

  test('speech is appended to what was already typed, not substituted for it', async ({ page }) => {
    await stubRecogniser(page, [{ transcript: 'and book the flights', isFinal: true }]);
    await openApp(page, '/guest/now');

    await page.getByTestId('drop-fab').click();
    await page.getByTestId('capture-input').fill('plan the trip');
    await page.getByTestId('capture-mic').click();

    await expect(page.getByTestId('capture-input')).toHaveValue('plan the trip and book the flights');
  });

  test('an interim guess is replaced by the final one rather than repeated', async ({ page }) => {
    await stubRecogniser(page, [
      { transcript: 'buy mil', isFinal: false },
      { transcript: 'buy milk', isFinal: true },
    ]);
    await openApp(page, '/guest/now');

    await page.getByTestId('drop-fab').click();
    await page.getByTestId('capture-mic').click();

    await expect(page.getByTestId('capture-input')).toHaveValue('buy milk');
  });
});

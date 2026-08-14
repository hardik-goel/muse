/**
 * Speech-to-text for capture, using the browser's own recogniser.
 *
 * No key, no cost, no server round-trip from our side: the Web Speech API is
 * built into Chrome, Edge and Safari. Firefox does not implement it, so the
 * button is not rendered there rather than rendered broken.
 *
 * Note the honest caveat — Chrome's implementation streams audio to Google for
 * recognition. That is the browser's doing, not ours, but it is why dictation
 * is a button you press rather than a mode that is ever on by default.
 */

/** The parts of the spec we use. TypeScript's lib.dom does not declare these. */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

export interface SpeechRecognitionErrorEventLike {
  readonly error: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

type RecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechWindow {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
}

/** The constructor, or null where the browser has no recogniser. */
export function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function dictationSupported(): boolean {
  return recognitionConstructor() !== null;
}

/**
 * Splits a results list into what has been settled and what is still being
 * revised. The recogniser re-sends the tail of an utterance as it changes its
 * mind, so only results at or after `resultIndex` are new.
 */
export function readResults(event: SpeechRecognitionEventLike): {
  settled: string;
  pending: string;
} {
  let settled = '';
  let pending = '';

  for (let i = event.resultIndex; i < event.results.length; i += 1) {
    const result = event.results[i];
    if (!result || result.length === 0) continue;
    const text = result[0]?.transcript ?? '';
    if (result.isFinal) settled += text;
    else pending += text;
  }

  return { settled, pending };
}

/**
 * Joins dictated speech onto whatever was already typed.
 *
 * Kept pure and separate from the component because the spacing is the fiddly
 * part: the recogniser hands back fragments with inconsistent leading spaces,
 * and a drop that reads "buy milkand call mum" is a bug the user notices long
 * before they notice anything else.
 */
export function mergeTranscript(base: string, settled: string, pending: string): string {
  const spoken = `${settled}${pending}`.replace(/\s+/g, ' ').trim();
  if (!spoken) return base;
  if (!base) return spoken;
  return /\s$/.test(base) ? `${base}${spoken}` : `${base} ${spoken}`;
}

/** What to tell the user when the recogniser gives up. */
export function dictationErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access is blocked. Allow it in your browser settings, then try again.';
    case 'no-speech':
      return 'Did not catch that. Try again.';
    case 'audio-capture':
      return 'No microphone found.';
    case 'network':
      return 'Speech recognition needs a connection. Type it instead.';
    case 'aborted':
      return '';
    default:
      return 'Dictation stopped unexpectedly. Type it instead.';
  }
}

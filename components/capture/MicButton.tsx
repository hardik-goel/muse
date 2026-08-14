'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  dictationErrorMessage,
  mergeTranscript,
  readResults,
  recognitionConstructor,
  type SpeechRecognitionLike,
} from '@/lib/dictation';

/**
 * Speak instead of typing.
 *
 * Renders nothing at all where the browser has no recogniser, so the capture
 * sheet never shows a button that cannot work. While listening, the text lands
 * in the box live — the same box, so a dictated drop can be corrected by hand
 * before it is dropped, and stopping mid-sentence keeps every word so far.
 */
export function MicButton({
  value,
  onText,
  disabled,
}: {
  value: string;
  onText: (next: string) => void;
  disabled?: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognition = useRef<SpeechRecognitionLike | null>(null);
  // What was in the box when the mic opened. Speech is appended to this rather
  // than to the live value, or each interim revision would stack on the last.
  const base = useRef('');
  const settled = useRef('');
  // The component re-renders on every syllable; the callback must not be stale.
  const emit = useRef(onText);
  emit.current = onText;

  // Feature detection has to wait for the client: the server has no window, and
  // rendering the button then removing it would flash on every open.
  useEffect(() => {
    setSupported(recognitionConstructor() !== null);
  }, []);

  const stop = useCallback(() => {
    recognition.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Recognition = recognitionConstructor();
    if (!Recognition) return;

    const engine = new Recognition();
    engine.lang = navigator.language || 'en-US';
    // Keep going through natural pauses; a thought worth capturing is rarely
    // one uninterrupted sentence.
    engine.continuous = true;
    engine.interimResults = true;

    base.current = value;
    settled.current = '';

    engine.onresult = (event) => {
      const { settled: fresh, pending } = readResults(event);
      settled.current += fresh;
      emit.current(mergeTranscript(base.current, settled.current, pending));
    };

    engine.onerror = (event) => {
      const message = dictationErrorMessage(event.error);
      if (message) setError(message);
      setListening(false);
    };

    engine.onend = () => setListening(false);

    recognition.current = engine;
    setError(null);

    try {
      engine.start();
      setListening(true);
    } catch {
      // start() throws if called twice in a row; the recogniser is already live.
      setListening(true);
    }
  }, [value]);

  // A sheet closed mid-sentence must not leave the microphone open.
  useEffect(() => () => recognition.current?.abort(), []);

  if (!supported) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => (listening ? stop() : start())}
          disabled={disabled}
          aria-pressed={listening}
          aria-label={listening ? 'Stop dictating' : 'Dictate instead of typing'}
          data-testid="capture-mic"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-40 ${
            listening
              ? 'border-champagne bg-champagne-tint text-champagne'
              : 'border-line bg-raised text-faint hover:text-muted'
          }`}
        >
          <MicGlyph listening={listening} />
        </button>

        <span aria-live="polite" className="text-xs text-faint">
          {listening ? 'Listening — speak, then tap to stop.' : 'Or say it out loud.'}
        </span>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function MicGlyph({ listening }: { listening: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      {listening ? <circle cx="12" cy="8.5" r="1.25" fill="currentColor" stroke="none" /> : null}
    </svg>
  );
}

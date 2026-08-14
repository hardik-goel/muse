import { describe, expect, it } from 'vitest';
import {
  dictationErrorMessage,
  mergeTranscript,
  readResults,
  type SpeechRecognitionEventLike,
} from '@/lib/dictation';

/** Builds the shape the Web Speech API hands to onresult. */
function event(
  results: { transcript: string; isFinal: boolean }[],
  resultIndex = 0,
): SpeechRecognitionEventLike {
  const list = results.map((r) => ({
    isFinal: r.isFinal,
    length: 1,
    0: { transcript: r.transcript },
  }));

  return {
    resultIndex,
    results: Object.assign(list, { length: list.length }),
  } as unknown as SpeechRecognitionEventLike;
}

describe('readResults', () => {
  it('separates settled speech from the part still being revised', () => {
    const { settled, pending } = readResults(
      event([
        { transcript: 'buy milk', isFinal: true },
        { transcript: ' and call', isFinal: false },
      ]),
    );

    expect(settled).toBe('buy milk');
    expect(pending).toBe(' and call');
  });

  it('ignores results the recogniser has already delivered', () => {
    const { settled } = readResults(
      event(
        [
          { transcript: 'old news', isFinal: true },
          { transcript: 'the new part', isFinal: true },
        ],
        1,
      ),
    );

    expect(settled).toBe('the new part');
  });

  it('survives an empty result list', () => {
    expect(readResults(event([]))).toEqual({ settled: '', pending: '' });
  });
});

describe('mergeTranscript', () => {
  it('puts a space between typed text and dictated text', () => {
    expect(mergeTranscript('buy milk', 'and call mum', '')).toBe('buy milk and call mum');
  });

  it('does not double a space the typist already left', () => {
    expect(mergeTranscript('buy milk ', 'and call mum', '')).toBe('buy milk and call mum');
  });

  it('returns the spoken words alone when nothing was typed', () => {
    expect(mergeTranscript('', 'a thought', '')).toBe('a thought');
  });

  it('leaves the box untouched when nothing was heard', () => {
    expect(mergeTranscript('half a sentence', '', '')).toBe('half a sentence');
    expect(mergeTranscript('half a sentence', '   ', '')).toBe('half a sentence');
  });

  it('collapses the ragged spacing the recogniser emits', () => {
    expect(mergeTranscript('', 'buy   milk', '  and bread')).toBe('buy milk and bread');
  });

  it('appends the pending fragment after the settled one', () => {
    expect(mergeTranscript('note:', 'ship the', ' release')).toBe('note: ship the release');
  });
});

describe('dictationErrorMessage', () => {
  it('tells the user how to fix a blocked microphone', () => {
    expect(dictationErrorMessage('not-allowed')).toMatch(/blocked/i);
    expect(dictationErrorMessage('service-not-allowed')).toMatch(/blocked/i);
  });

  it('stays silent when the user simply stopped it', () => {
    expect(dictationErrorMessage('aborted')).toBe('');
  });

  it('has something useful to say about anything else', () => {
    expect(dictationErrorMessage('no-speech')).toMatch(/catch that/i);
    expect(dictationErrorMessage('audio-capture')).toMatch(/microphone/i);
    expect(dictationErrorMessage('network')).toMatch(/connection/i);
    expect(dictationErrorMessage('something-new')).toMatch(/type it instead/i);
  });
});

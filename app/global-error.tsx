'use client';

/**
 * The last resort: an error thrown by the root layout itself, where no shared
 * chrome and no stylesheet can be assumed. Styles are inline for that reason.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          background: '#171216',
          color: '#f1e9de',
          fontFamily: 'Georgia, serif',
          textAlign: 'center',
          padding: '24px',
        }}
      >
        <h1 style={{ fontSize: '2rem', margin: 0 }}>Muse could not start.</h1>
        <p style={{ color: '#93857b', fontFamily: 'system-ui, sans-serif', fontSize: '0.875rem' }}>
          Your data is untouched. Reload and it will almost certainly be fine.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            border: 'none',
            borderRadius: '999px',
            background: '#d8c39a',
            color: '#171216',
            padding: '12px 24px',
            fontSize: '0.9375rem',
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
        {error.digest ? (
          <p style={{ color: '#6e6259', fontSize: '0.6875rem' }}>ref {error.digest}</p>
        ) : null}
      </body>
    </html>
  );
}

import '@testing-library/jest-dom/vitest';

// Deterministic environment for pure-logic tests.
process.env.TZ = 'UTC';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.MOCK_AI = 'true';

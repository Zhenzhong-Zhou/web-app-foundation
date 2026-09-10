import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { handlers } from './handlers';

export const server = setupServer(...handlers);

beforeAll(() => {
  /**
   * `error` rather than `warn`: an unhandled request means a component called
   * something these handlers do not describe, and letting it through produces
   * a confusing failure somewhere later instead of naming the call.
   */
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  // Overrides are per-test. Without this a handler set to return a 409 leaks
  // into the next test in the file and fails something unrelated.
  server.resetHandlers();
  cleanup();
});

afterAll(() => {
  server.close();
});

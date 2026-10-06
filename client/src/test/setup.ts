import '@testing-library/jest-dom/vitest';

import { cleanup, type RenderOptions } from '@testing-library/react';
import { setupServer } from 'msw/node';
import type { JSXElementConstructor, ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

import { handlers } from './handlers';

export const server = setupServer(...handlers);

type Wrapper = JSXElementConstructor<{ children: ReactNode }>;

/**
 * Every render and renderHook inside TestProviders (ADR-054), with a spec's
 * own wrapper, if it passes one, inside that. A mock of the library in one
 * place rather than a custom render every spec must remember to import:
 * forgetting it would fail with an error about react-intl, nowhere near
 * the component that needed it.
 */
vi.mock('@testing-library/react', async (importOriginal) => {
  // Imported in here, not at the top: vi.mock is hoisted above the file's
  // own imports, so nothing they bind exists yet when this runs.
  const actual =
    await importOriginal<typeof import('@testing-library/react')>();
  const { createElement } = await import('react');
  const { TestProviders } = await import('./test-providers');

  const withProviders = (inner?: Wrapper): Wrapper =>
    function Providers({ children }) {
      return createElement(
        TestProviders,
        null,
        inner ? createElement(inner, null, children) : children,
      );
    };

  return {
    ...actual,
    // Typed by hand: render is overloaded, and an overloaded type gives a
    // function written against it no parameter types to infer.
    render: ((ui: ReactNode, options?: RenderOptions) =>
      actual.render(ui, {
        ...options,
        wrapper: withProviders(options?.wrapper),
      })) as typeof actual.render,
    renderHook: ((callback, options) =>
      actual.renderHook(callback, {
        ...options,
        wrapper: withProviders(options?.wrapper as Wrapper | undefined),
      })) as typeof actual.renderHook,
  };
});

beforeAll(() => {
  /**
   * `error` rather than `warn`: an unhandled request means a component called
   * something these handlers do not describe, and letting it through produces
   * a confusing failure somewhere later instead of naming the call.
   */
  server.listen({ onUnhandledFrame: 'error' });
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

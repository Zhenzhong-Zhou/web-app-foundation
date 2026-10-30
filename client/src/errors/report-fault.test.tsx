import { createTransport, type Event, flush } from '@sentry/browser';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from '../components/error-boundary';
import { ApiError } from '../lib/api';
import { removeLoadingMark } from '../lib/loading-mark';
import { ChunkLoadError } from '../version/load-chunk';
import { MAX_REPORTS, reportFault, startReporting } from './report-fault';
import type { TrackerOptions } from './tracker';

type MakeTransport = NonNullable<TrackerOptions['transport']>;

/** The reports the tracker would have sent, recorded instead (ADR-084). */
let sent: Event[];
/** What each transport was made with: the route and its headers. */
let made: Parameters<MakeTransport>[0][];

const transport: MakeTransport = (options) => {
  made.push(options);
  return createTransport(options, (request) => {
    const lines = String(request.body).split('\n');
    for (let i = 1; i < lines.length; i += 2) {
      const item = JSON.parse(lines[i]) as { type: string };
      if (item.type === 'event') sent.push(JSON.parse(lines[i + 1]) as Event);
    }
    return Promise.resolve({ statusCode: 204 });
  });
};

/** An error thrown in the app's own files, as a browser's stack names them. */
function own<T extends Error>(error: T, at = window.location.origin): T {
  error.stack = `${error.name}: ${error.message}\n    at render (${at}/assets/index-B4-IlzMh.js:1:200)`;
  return error;
}

/**
 * An error no code caught, as the browser reports it to the page, where
 * the SDK's handler hears it: the event reportError fires, which jsdom
 * lacks. The listener stands in for the page's own, so the test runner
 * does not count the error as the test's.
 */
function uncaught(error: unknown) {
  const quiet = (event: ErrorEvent) => event.preventDefault();
  window.addEventListener('error', quiet);
  window.dispatchEvent(
    new ErrorEvent('error', {
      error,
      message: error instanceof Error ? error.message : String(error),
      cancelable: true,
    }),
  );
  window.removeEventListener('error', quiet);
}

const failed = (cause = 'Failed to fetch dynamically imported module') =>
  new TypeError(cause);

describe('the error tracker in the browser (ADR-084)', () => {
  beforeEach(async () => {
    sent = [];
    made = [];
    removeLoadingMark();
    await startReporting({ transport });
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('reports to the app’s own route with its header, its release, side and language', async () => {
    document.documentElement.lang = 'zh-Hans';
    reportFault(own(new Error('Broken')));
    await flush();
    document.documentElement.lang = '';

    expect(made[0]).toMatchObject({
      url: '/api/errors',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      release: '0.7.0+983c1d8f0e5a4b7c9d2e6f1a3b5c7d9e0f2a4b6c',
      tags: { side: 'browser', language: 'zh-Hans' },
    });
    expect(sent[0].user).toBeUndefined();
  });

  it('sends one report for a render error, with the reference the page shows', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Broken(): never {
      throw own(new Error('Broken page'));
    }

    render(
      <MemoryRouter>
        <ErrorBoundary resetKey="/orders/1">
          <Broken />
        </ErrorBoundary>
      </MemoryRouter>,
    );
    await flush();

    expect(sent).toHaveLength(1);
    const reference = sent[0].tags?.reference;
    expect(reference).toEqual(expect.any(String));
    expect(screen.getByText(String(reference))).toBeInTheDocument();
  });

  it('reports an error no code caught, through the SDK’s handler', async () => {
    uncaught(own(new Error('Nobody caught this')));
    await flush();

    expect(sent).toHaveLength(1);
  });

  it('sends one report for a crash that reaches both the root and the SDK’s handler', async () => {
    const crash = own(new Error('Crashed outside every boundary'));

    // As main.tsx's onUncaughtError: to the tracker, then as React reports
    // it, which the SDK's own handler hears.
    reportFault(crash);
    uncaught(crash);
    await flush();

    expect(sent).toHaveLength(1);
  });

  it.each([
    ['a refusal', new ApiError('Not allowed', 403, 'req-1')],
    ['a 500, which the server reported', new ApiError('Failed', 500, 'req-2')],
    ['a chunk, offline', new ChunkLoadError('offline', failed())],
    ['a chunk, a newer build', new ChunkLoadError('newer', failed())],
    ['Chrome’s dropped connection', new TypeError('Failed to fetch')],
    [
      'Firefox’s dropped connection',
      new TypeError('NetworkError when attempting to fetch resource.'),
    ],
    ['Safari’s dropped connection', new TypeError('Load failed')],
    ['a request cancelled', new DOMException('Aborted', 'AbortError')],
  ])('sends nothing for %s, reported or uncaught', async (_, error) => {
    reportFault(own(error));
    uncaught(own(error));
    await flush();

    expect(sent).toEqual([]);
  });

  it('sends nothing from another origin’s files, such as an extension’s', async () => {
    uncaught(own(new Error('Not ours'), 'chrome-extension://abcdef'));
    await flush();

    expect(sent).toEqual([]);
  });

  it('reports a page, a catalogue or a guide broken in this build', async () => {
    reportFault(own(new ChunkLoadError('broken', failed())));
    await flush();

    expect(sent).toHaveLength(1);
    expect(sent[0].exception?.values?.at(-1)?.value).toBe(
      'A chunk did not load (broken)',
    );
  });

  it('gives the page’s address without its query, and none in its trail', async () => {
    window.history.pushState(null, '', '/orders?search=Jane%20Doe#top');
    reportFault(own(new Error('Broken')));
    await flush();

    expect(sent[0].request?.url).toBe(`${window.location.origin}/orders`);
    expect(sent[0].breadcrumbs?.at(-1)).toMatchObject({
      category: 'navigation',
      data: { to: '/orders' },
    });
    expect(JSON.stringify(sent[0])).not.toContain('Jane');
  });

  it(`stops a fault in a loop at ${MAX_REPORTS} reports`, async () => {
    for (let i = 1; i <= MAX_REPORTS + 5; i++) {
      reportFault(own(new Error(`Broken, time ${i}`)));
    }
    await flush();

    expect(sent).toHaveLength(MAX_REPORTS);
  });

  it('loads nothing before the first screen draws, then sends what it held', async () => {
    vi.resetModules();
    const loaded = vi.fn();
    vi.doMock('./tracker', async (original) => {
      loaded();
      return original();
    });
    try {
      const reporting = await import('./report-fault');
      const mark = await import('../lib/loading-mark');

      const started = reporting.startReporting({ transport });
      reporting.reportFault(own(new Error('Before the first screen')));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(loaded).not.toHaveBeenCalled();
      expect(sent).toEqual([]);

      mark.removeLoadingMark();
      await started;
      await flush();

      expect(loaded).toHaveBeenCalledTimes(1);
      expect(sent).toHaveLength(1);
      expect(sent[0].exception?.values?.[0]?.value).toBe(
        'Before the first screen',
      );
    } finally {
      vi.doUnmock('./tracker');
    }
  });
});

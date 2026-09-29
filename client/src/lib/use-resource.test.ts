import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '../test/setup';
import { useResource } from './use-resource';

type Thing = { id: string; name: string };

const BASE = '/api/v1';

/**
 * These pin down the behaviour each page had written out by hand: the first
 * read, a Refresh that retries, a failed Refresh that keeps what is shown,
 * and a late answer for a record the page has already left.
 */
describe('useResource', () => {
  it('reads on first render and reports loading until it answers', async () => {
    server.use(
      http.get(`${BASE}/things/a`, () =>
        HttpResponse.json({ id: 'a', name: 'First' }),
      ),
    );

    const { result } = renderHook(() => useResource<Thing>('/things/a'));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.data?.name).toBe('First'));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('shows the server message when the first read fails', async () => {
    server.use(
      http.get(`${BASE}/things/a`, () =>
        HttpResponse.json({ message: 'Thing not found' }, { status: 404 }),
      ),
    );

    const { result } = renderHook(() => useResource<Thing>('/things/a'));

    await waitFor(() => expect(result.current.error).toBe('Thing not found'));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('clears the error when a reload succeeds', async () => {
    let fail = true;
    server.use(
      http.get(`${BASE}/things/a`, () =>
        fail
          ? HttpResponse.json({ message: 'Try again' }, { status: 503 })
          : HttpResponse.json({ id: 'a', name: 'First' }),
      ),
    );

    const { result } = renderHook(() => useResource<Thing>('/things/a'));
    await waitFor(() => expect(result.current.error).toBe('Try again'));

    fail = false;
    await act(async () => {
      await result.current.reload();
    });

    // Refresh is a retry: the banner goes once the read works.
    expect(result.current.error).toBeNull();
    expect(result.current.data?.name).toBe('First');
  });

  it('keeps the data shown when a reload fails, and says so', async () => {
    let fail = false;
    server.use(
      http.get(`${BASE}/things/a`, () =>
        fail
          ? HttpResponse.error()
          : HttpResponse.json({ id: 'a', name: 'First' }),
      ),
    );

    const { result } = renderHook(() => useResource<Thing>('/things/a'));
    await waitFor(() => expect(result.current.data?.name).toBe('First'));

    fail = true;
    await act(async () => {
      // Resolves rather than rejects: the failure lands in `error`, so a
      // caller that does not catch cannot leave an unhandled rejection.
      await result.current.reload();
    });

    expect(result.current.error).toBe('Could not reach the server.');
    expect(result.current.data?.name).toBe('First');
  });

  it('ignores a late answer for a path it has moved on from', async () => {
    let answerFirst: () => void = () => undefined;
    const firstAnswered = new Promise<void>((resolve) => {
      answerFirst = resolve;
    });

    server.use(
      http.get(`${BASE}/things/a`, async () => {
        await firstAnswered;
        return HttpResponse.json({ id: 'a', name: 'First' });
      }),
      http.get(`${BASE}/things/b`, () =>
        HttpResponse.json({ id: 'b', name: 'Second' }),
      ),
    );

    const { result, rerender } = renderHook(
      ({ path }) => useResource<Thing>(path),
      { initialProps: { path: '/things/a' } },
    );

    rerender({ path: '/things/b' });
    await waitFor(() => expect(result.current.data?.name).toBe('Second'));

    answerFirst();

    // Give the stale response every chance to land before checking it didn't.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.data?.name).toBe('Second');
  });

  it('lets the page write its own errors to the same banner', async () => {
    server.use(
      http.get(`${BASE}/things/a`, () =>
        HttpResponse.json({ id: 'a', name: 'First' }),
      ),
    );

    const { result } = renderHook(() => useResource<Thing>('/things/a'));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    act(() => result.current.setError('That action was refused.'));

    expect(result.current.error).toBe('That action was refused.');
    expect(result.current.data?.name).toBe('First');
  });
});

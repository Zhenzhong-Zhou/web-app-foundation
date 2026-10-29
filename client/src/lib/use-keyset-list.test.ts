import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { useLanguage } from '../i18n/use-language';
import { server } from '../test/setup';
import { deploy, OUTDATED, outdatedRefusal } from '../test/version';
import { useKeysetList } from './use-keyset-list';

type Row = { id: string };

const BASE = '/api/v1';

const rows = (...ids: string[]) => ids.map((id) => ({ id }));
const ids = (entries: Row[] | null) => entries?.map((row) => row.id);

/** A handler that answers only when the test says so. */
function held() {
  let answer: () => void = () => undefined;
  const answered = new Promise<void>((resolve) => {
    answer = resolve;
  });
  return { answer, answered };
}

/**
 * One page per `before`: no cursor gives the head, `c1` the second page.
 * `status` picks between two lists, so a filter change is a different list.
 */
function pagedThings() {
  server.use(
    http.get(`${BASE}/things`, ({ request }) => {
      const url = new URL(request.url);
      const status = url.searchParams.get('status') ?? 'open';
      const before = url.searchParams.get('before');

      if (status === 'closed') {
        return HttpResponse.json({ entries: rows('x1'), nextCursor: null });
      }

      return before === 'c1'
        ? HttpResponse.json({ entries: rows('a3'), nextCursor: null })
        : HttpResponse.json({ entries: rows('a1', 'a2'), nextCursor: 'c1' });
    }),
  );
}

describe('useKeysetList', () => {
  it('reads the first page and says whether more exists', async () => {
    pagedThings();

    const { result } = renderHook(() => useKeysetList<Row>('/things'));

    expect(result.current.loading).toBe(true);
    await waitFor(() =>
      expect(ids(result.current.entries)).toEqual(['a1', 'a2']),
    );
    expect(result.current.loading).toBe(false);
    expect(result.current.hasMore).toBe(true);
  });

  it('appends the next page, keeping the filters in the query', async () => {
    let seen = '';
    server.use(
      http.get(`${BASE}/things`, ({ request }) => {
        const url = new URL(request.url);
        seen = url.search;
        return url.searchParams.get('before')
          ? HttpResponse.json({ entries: rows('a3'), nextCursor: null })
          : HttpResponse.json({ entries: rows('a1'), nextCursor: 'c1' });
      }),
    );

    const { result } = renderHook(() =>
      useKeysetList<Row>('/things?status=open&limit=25'),
    );
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(seen).toBe('?status=open&limit=25&before=c1');
    expect(ids(result.current.entries)).toEqual(['a1', 'a3']);
    expect(result.current.hasMore).toBe(false);
  });

  it('encodes the cursor, so a + in it is not read as a space', async () => {
    let before: string | null = null;
    server.use(
      http.get(`${BASE}/things`, ({ request }) => {
        before = new URL(request.url).searchParams.get('before');
        return before
          ? HttpResponse.json({ entries: [], nextCursor: null })
          : HttpResponse.json({ entries: rows('a1'), nextCursor: 'a+b/c=' });
      }),
    );

    const { result } = renderHook(() => useKeysetList<Row>('/things'));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(before).toBe('a+b/c=');
  });

  it('starts clean when the path changes, error included', async () => {
    let fail = true;
    server.use(
      http.get(`${BASE}/things`, ({ request }) => {
        const status = new URL(request.url).searchParams.get('status');
        if (status === 'open' && fail) {
          return HttpResponse.json({ message: 'Down' }, { status: 503 });
        }
        return HttpResponse.json({ entries: rows('x1'), nextCursor: null });
      }),
    );

    const { result, rerender } = renderHook(
      ({ path }) => useKeysetList<Row>(path),
      { initialProps: { path: '/things?status=open' } },
    );
    await waitFor(() => expect(result.current.error).toBe('Down'));

    fail = false;
    rerender({ path: '/things?status=closed' });

    // At once, before the new list answers: no old error, no old rows.
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(ids(result.current.entries)).toEqual(['x1']));
  });

  it('drops a page that answers after the list has changed', async () => {
    const second = held();
    server.use(
      http.get(`${BASE}/things`, async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('status') === 'closed') {
          return HttpResponse.json({ entries: rows('x1'), nextCursor: null });
        }
        if (url.searchParams.get('before')) {
          await second.answered;
          return HttpResponse.json({ entries: rows('a3'), nextCursor: null });
        }
        return HttpResponse.json({ entries: rows('a1'), nextCursor: 'c1' });
      }),
    );

    const { result, rerender } = renderHook(
      ({ path }) => useKeysetList<Row>(path),
      { initialProps: { path: '/things?status=open' } },
    );
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    let more: Promise<void> = Promise.resolve();
    act(() => {
      more = result.current.loadMore();
    });

    rerender({ path: '/things?status=closed' });
    await waitFor(() => expect(ids(result.current.entries)).toEqual(['x1']));

    second.answer();
    await act(async () => {
      await more;
    });

    // The open list's second page, arriving late, stays out of the closed one.
    expect(ids(result.current.entries)).toEqual(['x1']);
  });

  it('keeps the rows when Load more fails, and clears the error when it works', async () => {
    let fail = true;
    server.use(
      http.get(`${BASE}/things`, ({ request }) => {
        if (!new URL(request.url).searchParams.get('before')) {
          return HttpResponse.json({ entries: rows('a1'), nextCursor: 'c1' });
        }
        return fail
          ? HttpResponse.error()
          : HttpResponse.json({ entries: rows('a2'), nextCursor: null });
      }),
    );

    const { result } = renderHook(() => useKeysetList<Row>('/things'));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.error).toBe('Could not reach the server.');
    expect(ids(result.current.entries)).toEqual(['a1']);
    expect(result.current.hasMore).toBe(true);

    fail = false;
    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.error).toBeNull();
    expect(ids(result.current.entries)).toEqual(['a1', 'a2']);
  });

  it('says a first page that failed failed, with no rows, until a read works (#195)', async () => {
    let fail = true;
    server.use(
      http.get(`${BASE}/things`, () =>
        fail
          ? HttpResponse.error()
          : HttpResponse.json({ entries: rows('a1'), nextCursor: 'c1' }),
      ),
    );

    const { result } = renderHook(() => useKeysetList<Row>('/things'));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.error).toBe('Could not reach the server.');
    expect(result.current.entries).toBeNull();
    expect(result.current.loading).toBe(false);

    fail = false;
    act(() => result.current.reload());
    await waitFor(() => expect(ids(result.current.entries)).toEqual(['a1']));
    expect(result.current.failed).toBe(false);
    expect(result.current.error).toBeNull();

    // A Load more that fails keeps the rows: not a failed list.
    fail = true;
    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.error).toBe('Could not reach the server.');
    expect(result.current.failed).toBe(false);
  });

  it('reads the first page again on reload, keeping the rows up meanwhile', async () => {
    // The head changes between reads, as it does after a run is planned.
    let heads = 0;
    const reply = held();
    server.use(
      http.get(`${BASE}/things`, async () => {
        heads += 1;
        if (heads === 1) {
          return HttpResponse.json({
            entries: rows('a1', 'a2'),
            nextCursor: 'c1',
          });
        }
        await reply.answered;
        return HttpResponse.json({
          entries: rows('a0', 'a1'),
          nextCursor: 'c0',
        });
      }),
    );

    const { result } = renderHook(() => useKeysetList<Row>('/things'));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    act(() => result.current.reload());

    // While it is in flight: the old rows, no skeleton, and no Load more off
    // a cursor that belongs to the head being replaced.
    expect(result.current.loading).toBe(false);
    expect(ids(result.current.entries)).toEqual(['a1', 'a2']);
    expect(result.current.hasMore).toBe(false);

    reply.answer();
    await waitFor(() =>
      expect(ids(result.current.entries)).toEqual(['a0', 'a1']),
    );
    expect(result.current.hasMore).toBe(true);
  });

  it('reads the first page again when the language changes, keeping the rows up meanwhile (#297)', async () => {
    const { answer, answered } = held();
    const asked: (string | null)[] = [];
    server.use(
      http.get(`${BASE}/things`, async ({ request }) => {
        const language = request.headers.get('accept-language');
        asked.push(language);
        if (language !== 'zh-Hans')
          return HttpResponse.json({ entries: rows('a'), nextCursor: 'c1' });
        await answered;
        return HttpResponse.json({ entries: rows('甲'), nextCursor: null });
      }),
    );

    const { result } = renderHook(() => ({
      list: useKeysetList<Row>('/things'),
      language: useLanguage(),
    }));
    await waitFor(() =>
      expect(ids(result.current.list.entries)).toEqual(['a']),
    );

    try {
      await act(() => result.current.language.setLocale('zh-Hans'));
      await expect.poll(() => asked).toEqual(['en', 'zh-Hans']);
      // The rows stay up, but not their cursor: the next page would be the
      // old language's.
      expect(ids(result.current.list.entries)).toEqual(['a']);
      expect(result.current.list.hasMore).toBe(false);

      answer();
      await waitFor(() =>
        expect(ids(result.current.list.entries)).toEqual(['甲']),
      );
    } finally {
      localStorage.clear();
    }
  });

  it('reads nothing for a null path', async () => {
    // The shared handlers have no /things; an unexpected request would fail
    // the test through the server's onUnhandledFrame.
    const { result } = renderHook(() => useKeysetList<Row>(null));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.entries).toBeNull();
    expect(result.current.hasMore).toBe(false);
  });

  /** An outdated tab's refusal (ADR-081), as useResource has it. */
  describe('refused for this tab’s API revision', () => {
    const INSTALLING =
      'A new version is being installed. Try again in a minute; nothing was saved.';

    it('reports a first page refused, with no rows to show', async () => {
      server.use(http.get(`${BASE}/things`, () => outdatedRefusal()));

      const { result } = renderHook(() => useKeysetList<Row>('/things'));

      await waitFor(() => expect(result.current.refused).not.toBeNull());
      expect(result.current.entries).toBeNull();
    });

    it('keeps the rows when Load more is refused, its words following the new version as it comes out', async () => {
      pagedThings();
      const { result } = renderHook(() => useKeysetList<Row>('/things'));
      await waitFor(() => expect(result.current.hasMore).toBe(true));

      server.use(http.get(`${BASE}/things`, () => outdatedRefusal()));
      await act(() => result.current.loadMore());
      expect(result.current.refused).toBeNull();
      expect(ids(result.current.entries)).toEqual(['a1', 'a2']);
      expect(result.current.error).toBe(INSTALLING);

      await deploy({ urgent: true });
      expect(result.current.error).toBe(OUTDATED);
    });
  });
});

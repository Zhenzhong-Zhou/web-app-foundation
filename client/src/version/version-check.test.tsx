import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { Link, MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_REVISION } from '../api/revision.gen';
import { server } from '../test/setup';
import { serveVersion } from '../test/version';
import { BUILD } from './build';
import { reloadPage } from './reload-page';
import {
  checkVersion,
  loadNewerOnce,
  noteOutdated,
  noteServed,
  useNewVersion,
  useReloadAtNextPage,
  useVersionReads,
  VersionWatch,
} from './version-check';

describe('checkVersion', () => {
  it('finds nothing new while the file names this build', async () => {
    const { result } = renderHook(() => useNewVersion());

    expect(await checkVersion()).toBe('same');
    expect(result.current).toEqual({
      newer: false,
      urgent: false,
      outdated: false,
    });
  });

  it('finds a newer build, not urgent while its API revision is the same', async () => {
    serveVersion();
    const { result } = renderHook(() => useNewVersion());

    expect(await act(() => checkVersion())).toBe('newer');
    expect(result.current).toEqual({
      newer: true,
      urgent: false,
      outdated: false,
    });
  });

  it('finds it urgent once its API revision is above this tab’s', async () => {
    serveVersion({ urgent: true });
    const { result } = renderHook(() => useNewVersion());

    await act(() => checkVersion());
    expect(result.current).toEqual({
      newer: true,
      urgent: true,
      outdated: false,
    });
  });

  it('never counts the dev server’s build as newer', async () => {
    serveVersion({ build: 'dev' });
    expect(await checkVersion()).toBe('same');
  });

  it('reads index.html in the file’s place as unreadable, and changes nothing', async () => {
    serveVersion();
    const { result } = renderHook(() => useNewVersion());
    await act(() => checkVersion());

    // What the static host answers for a .json it does not have.
    server.use(
      http.get(
        '/version.json',
        () =>
          new HttpResponse('<!doctype html><html></html>', {
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    );
    expect(await checkVersion()).toBe('unreadable');
    server.use(http.get('/version.json', () => HttpResponse.error()));
    expect(await checkVersion()).toBe('unreadable');
    server.use(
      http.get('/version.json', () =>
        HttpResponse.json({ status: 'ok' }, { status: 200 }),
      ),
    );
    expect(await checkVersion()).toBe('unreadable');

    expect(result.current).toEqual({
      newer: true,
      urgent: false,
      outdated: false,
    });
  });

  it('asks past every cache, with a query of its own each time', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');

    await checkVersion();
    await new Promise((resolve) => setTimeout(resolve, 2));
    await checkVersion();

    // no-store for the browser's cache; a query Render's edge has not seen.
    const asked = fetch.mock.calls.map(([url, init]) => ({ url, init }));
    expect(asked).toEqual([
      {
        url: expect.stringMatching(/^\/version\.json\?\d+$/),
        init: { cache: 'no-store', signal: expect.any(AbortSignal) },
      },
      {
        url: expect.stringMatching(/^\/version\.json\?\d+$/),
        init: { cache: 'no-store', signal: expect.any(AbortSignal) },
      },
    ]);
    expect(asked[1].url).not.toBe(asked[0].url);
  });

  // A refusal and a chunk that would not load wait for the read before
  // anything shows, so a file that never answers must not hold them.
  it('gives up on a read after five seconds, as unreadable, and changes nothing', async () => {
    serveVersion();
    const { result } = renderHook(() => useNewVersion());
    await act(() => checkVersion());

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      server.use(
        http.get('/version.json', async () => {
          await delay('infinite');
          return HttpResponse.json({ ...BUILD, apiRevision: API_REVISION });
        }),
      );
      let settled = false;
      const read = checkVersion().finally(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(4_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await read).toBe('unreadable');
    } finally {
      vi.useRealTimers();
    }
    expect(result.current).toEqual({
      newer: true,
      urgent: false,
      outdated: false,
    });
  });
});

describe('noteOutdated', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the file at once, and makes a newer build urgent though its revision is the same', async () => {
    serveVersion();
    const { result } = renderHook(() => useNewVersion());

    expect(await act(() => noteOutdated())).toBe('newer');
    expect(result.current).toEqual({
      newer: true,
      urgent: true,
      outdated: true,
    });
  });

  it('reads the file every 30 seconds while the new version is on its way, and stops once it is out', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let reads = 0;
    let build = BUILD.build;
    server.use(
      http.get('/version.json', () => {
        reads += 1;
        return HttpResponse.json({
          ...BUILD,
          build,
          apiRevision: API_REVISION + 1,
        });
      }),
    );
    const { result } = renderHook(() => useNewVersion());

    // The API went first: the file still names this tab's build.
    expect(await act(() => noteOutdated())).toBe('same');
    expect(result.current).toEqual({
      newer: false,
      urgent: false,
      outdated: true,
    });
    expect(reads).toBe(1);

    await act(() => vi.advanceTimersByTimeAsync(30_000));
    await vi.waitFor(() => expect(reads).toBe(2));

    // The static site has deployed.
    build = 'a1b2c3d';
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    await vi.waitFor(() =>
      expect(result.current).toEqual({
        newer: true,
        urgent: true,
        outdated: true,
      }),
    );
    expect(reads).toBe(3);

    await act(() => vi.advanceTimersByTimeAsync(90_000));
    expect(reads).toBe(3);
  });

  it('reads nothing more for a later refusal once a newer build is known', async () => {
    let reads = 0;
    server.use(
      http.get('/version.json', () => {
        reads += 1;
        return HttpResponse.json({
          ...BUILD,
          build: 'a1b2c3d',
          apiRevision: API_REVISION,
        });
      }),
    );
    await act(() => noteOutdated());
    expect(reads).toBe(1);

    expect(await act(() => noteOutdated())).toBe('newer');
    expect(reads).toBe(1);
  });

  it('forgets it once the API serves this tab again, as after a rollback', async () => {
    serveVersion();
    const { result } = renderHook(() => useNewVersion());
    await act(() => noteOutdated());

    act(() => noteServed());
    expect(result.current).toEqual({
      newer: true,
      urgent: false,
      outdated: false,
    });
  });
});

describe('useVersionReads', () => {
  let reads = 0;
  beforeEach(() => {
    reads = 0;
    server.use(
      http.get('/version.json', () => {
        reads += 1;
        return HttpResponse.json({ ...BUILD, apiRevision: API_REVISION });
      }),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const showTab = (state: DocumentVisibilityState) => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
    document.dispatchEvent(new Event('visibilitychange'));
  };

  it('reads as the tab starts, again as it comes back to the front, and nothing while hidden', async () => {
    renderHook(() => useVersionReads());
    await vi.waitFor(() => expect(reads).toBe(1));

    showTab('hidden');
    showTab('visible');
    await vi.waitFor(() => expect(reads).toBe(2));
  });

  it('reads every ten minutes while in front', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    renderHook(() => useVersionReads());
    await vi.waitFor(() => expect(reads).toBe(1));

    vi.advanceTimersByTime(9 * 60_000);
    expect(reads).toBe(1);
    vi.advanceTimersByTime(60_000);
    await vi.waitFor(() => expect(reads).toBe(2));
  });
});

describe('loadNewerOnce', () => {
  afterEach(() => vi.mocked(reloadPage).mockClear());

  const now = Date.now();
  const at = (later: number) =>
    vi.spyOn(Date, 'now').mockReturnValue(now + later);

  it('loads in full once per newer build, and never again for it', async () => {
    serveVersion();
    await checkVersion();

    at(0);
    expect(loadNewerOnce()).toBe(true);
    at(10 * 60_000);
    expect(loadNewerOnce()).toBe(false);
    expect(reloadPage).toHaveBeenCalledTimes(1);

    // Another build, and it may load again.
    serveVersion({ build: 'e4f5a6b' });
    await checkVersion();
    expect(loadNewerOnce()).toBe(true);
    expect(reloadPage).toHaveBeenCalledTimes(2);
  });

  it('loads again for the same build once the time a caller gives has passed', async () => {
    serveVersion();
    await checkVersion();

    at(0);
    expect(loadNewerOnce(60_000)).toBe(true);
    at(30_000);
    expect(loadNewerOnce(60_000)).toBe(false);
    at(61_000);
    expect(loadNewerOnce(60_000)).toBe(true);
    expect(reloadPage).toHaveBeenCalledTimes(2);
  });

  it('loads nothing while no newer build is known', () => {
    expect(loadNewerOnce()).toBe(false);
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('loads nothing where storage is refused, since nothing would stop it repeating', async () => {
    serveVersion();
    await checkVersion();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });

    expect(loadNewerOnce()).toBe(false);
    expect(reloadPage).not.toHaveBeenCalled();
  });
});

describe('useReloadAtNextPage', () => {
  function Page() {
    useReloadAtNextPage();
    const location = useLocation();
    return (
      <>
        <p>{location.pathname + location.search}</p>
        <Link to="/orders/1?tab=history">History tab</Link>
        <Link to="/orders?status=open">Open orders</Link>
        <Link to="/inventory">Inventory</Link>
      </>
    );
  }

  const renderAt = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Page />
      </MemoryRouter>,
    );

  afterEach(() => vi.mocked(reloadPage).mockClear());

  it('moves between pages as ever while nothing newer is known', async () => {
    const user = userEvent.setup();
    renderAt('/orders');

    await user.click(screen.getByRole('link', { name: 'Inventory' }));
    expect(screen.getByText('/inventory')).toBeInTheDocument();
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('loads the next page in full once a newer build is known, not a tab or a filter', async () => {
    serveVersion();
    await checkVersion();
    const user = userEvent.setup();
    renderAt('/orders/1');

    // The same page with another tab, or a filter: nothing reloads.
    await user.click(screen.getByRole('link', { name: 'History tab' }));
    expect(screen.getByText('/orders/1?tab=history')).toBeInTheDocument();
    expect(reloadPage).not.toHaveBeenCalled();

    // Another page: once it has rendered, it loads in full.
    await user.click(screen.getByRole('link', { name: 'Inventory' }));
    expect(screen.getByText('/inventory')).toBeInTheDocument();
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('loads in full once per new version: back on the old build, later pages leave it to the person', async () => {
    serveVersion();
    await checkVersion();
    const user = userEvent.setup();
    const first = renderAt('/orders');

    await user.click(screen.getByRole('link', { name: 'Inventory' }));
    expect(reloadPage).toHaveBeenCalledTimes(1);

    // The load came back on this tab's build, as Render's edge can serve
    // the old index.html for five minutes, and the file still names the
    // new one: another page loads nothing more.
    first.unmount();
    renderAt('/inventory');
    await checkVersion();
    await user.click(screen.getByRole('link', { name: 'Open orders' }));
    expect(screen.getByText('/orders?status=open')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Inventory' }));
    expect(screen.getByText('/inventory')).toBeInTheDocument();
    expect(reloadPage).toHaveBeenCalledTimes(1);

    // A version newer still: the next page loads in full for it, once.
    serveVersion({ build: 'e4f5a6b' });
    await checkVersion();
    await user.click(screen.getByRole('link', { name: 'Open orders' }));
    expect(reloadPage).toHaveBeenCalledTimes(2);
  });

  it('keeps a filter in the address on the same page', async () => {
    serveVersion();
    await checkVersion();
    const user = userEvent.setup();
    renderAt('/orders');

    await user.click(screen.getByRole('link', { name: 'Open orders' }));
    expect(screen.getByText('/orders?status=open')).toBeInTheDocument();
    expect(reloadPage).not.toHaveBeenCalled();
  });
});

describe('VersionWatch', () => {
  afterEach(() => vi.mocked(reloadPage).mockClear());

  it('reads the file as the app starts, and loads the next page in full once a newer build is out', async () => {
    let reads = 0;
    server.use(
      http.get('/version.json', () => {
        reads += 1;
        return HttpResponse.json({
          ...BUILD,
          build: 'a1b2c3d',
          apiRevision: API_REVISION,
        });
      }),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/orders']}>
        <VersionWatch />
        <Link to="/inventory">Inventory</Link>
      </MemoryRouter>,
    );
    await vi.waitFor(() => expect(reads).toBe(1));
    await act(() => checkVersion());

    await user.click(screen.getByRole('link', { name: 'Inventory' }));
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });
});

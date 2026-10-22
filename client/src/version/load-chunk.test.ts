import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_REVISION } from '../api/revision.gen';
import { server } from '../test/setup';
import { BUILD } from './build';
import {
  ChunkLoadError,
  loadChunk,
  loadNewerOnce,
  loadPage,
} from './load-chunk';
import { reloadPage } from './reload-page';
import { checkVersion } from './version-check';

/** The static host's version.json, as after a deploy of `build`. */
function serve(build: string) {
  server.use(
    http.get('/version.json', () =>
      HttpResponse.json({ ...BUILD, build, apiRevision: API_REVISION }),
    ),
  );
}

/** A chunk whose first `failures` loads reject, as the browser's import does. */
function chunk(failures: number) {
  const browsers = new TypeError(
    'Failed to fetch dynamically imported module: /assets/orders-page.js',
  );
  return vi.fn(() =>
    failures-- > 0
      ? Promise.reject(browsers)
      : Promise.resolve({ OrdersPage: 'the page' }),
  );
}

/** A load's outcome, once the second's wait before its second try is over. */
async function outcome<T>(loading: Promise<T>): Promise<T | unknown> {
  const settled = loading.catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(1000);
  return settled;
}

beforeEach(async () => {
  sessionStorage.clear();
  vi.mocked(reloadPage).mockClear();
  // This tab's own build on the server, whatever the test before it read.
  await checkVersion();
  vi.useFakeTimers({ toFake: ['setTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('loadChunk', () => {
  it('tries once more after a second, and loads', async () => {
    const load = chunk(1);
    const loading = loadChunk(load);

    await vi.advanceTimersByTimeAsync(999);
    expect(load).toHaveBeenCalledTimes(1);

    expect(await outcome(loading)).toEqual({ OrdersPage: 'the page' });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('says the connection dropped when the version file cannot be read either', async () => {
    server.use(http.get('/version.json', () => HttpResponse.error()));
    const load = chunk(2);

    const error = await outcome(loadChunk(load));
    expect(error).toBeInstanceOf(ChunkLoadError);
    expect(error).toMatchObject({ failure: 'offline' });
    // The browser's own error, kept for the console.
    expect((error as ChunkLoadError).cause).toBeInstanceOf(TypeError);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('says a new version came out when the file names a newer build', async () => {
    serve('a1b2c3d');
    expect(await outcome(loadChunk(chunk(2)))).toMatchObject({
      failure: 'newer',
    });
  });

  it('calls it a real failure when the file names this build', async () => {
    expect(await outcome(loadChunk(chunk(2)))).toMatchObject({
      failure: 'broken',
    });
  });
});

describe('loadPage', () => {
  it('loads the page being opened in full from a newer build, and waits for it', async () => {
    serve('a1b2c3d');
    let settled = false;
    void loadPage(chunk(2)).finally(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1));
    // The route keeps its loading state while the browser loads.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe(false);
  });

  it('hands the error boundary anything but a newer build, loading nothing', async () => {
    server.use(http.get('/version.json', () => HttpResponse.error()));
    expect(await outcome(loadPage(chunk(2)))).toMatchObject({
      failure: 'offline',
    });
    expect(reloadPage).not.toHaveBeenCalled();
  });
});

describe('loadNewerOnce', () => {
  const now = Date.now();
  const at = (later: number) =>
    vi.spyOn(Date, 'now').mockReturnValue(now + later);

  it('loads in full once per newer build within a minute, so it never loops', async () => {
    serve('a1b2c3d');
    await checkVersion();

    at(0);
    expect(loadNewerOnce()).toBe(true);
    // The load brought the same failure back: this time it says so.
    at(30_000);
    expect(loadNewerOnce()).toBe(false);
    expect(reloadPage).toHaveBeenCalledTimes(1);

    // A minute on, or another build, and it may load again.
    at(61_000);
    expect(loadNewerOnce()).toBe(true);
    serve('e4f5a6b');
    await checkVersion();
    at(62_000);
    expect(loadNewerOnce()).toBe(true);
    expect(reloadPage).toHaveBeenCalledTimes(3);
  });

  it('loads nothing while no newer build is known', () => {
    expect(loadNewerOnce()).toBe(false);
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('loads nothing where storage is refused, since nothing would stop a loop', async () => {
    serve('a1b2c3d');
    await checkVersion();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });

    expect(loadNewerOnce()).toBe(false);
    expect(reloadPage).not.toHaveBeenCalled();
  });
});

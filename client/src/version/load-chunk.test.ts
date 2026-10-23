import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../test/setup';
import { serveVersion } from '../test/version';
import { ChunkLoadError, loadChunk, loadChunkOrReload } from './load-chunk';
import { reloadPage } from './reload-page';

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

beforeEach(() => {
  vi.mocked(reloadPage).mockClear();
  vi.useFakeTimers({ toFake: ['setTimeout'] });
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
    serveVersion();
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

describe('loadChunkOrReload', () => {
  it('loads the page being opened in full from a newer build, and waits for it', async () => {
    serveVersion();
    let settled = false;
    void loadChunkOrReload(chunk(2)).finally(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1));
    // The route keeps its loading state while the browser loads.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe(false);
  });

  it('loads in full once a minute at most for a build, so it never loops', async () => {
    serveVersion();
    const now = Date.now();
    void loadChunkOrReload(chunk(2));
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1));

    // The load brought the same failure back: this time it says so.
    expect(await outcome(loadChunkOrReload(chunk(2)))).toMatchObject({
      failure: 'newer',
    });
    expect(reloadPage).toHaveBeenCalledTimes(1);

    // A minute on, it may load again.
    vi.spyOn(Date, 'now').mockReturnValue(now + 61_000);
    void loadChunkOrReload(chunk(2));
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(2));
  });

  it('hands the error boundary anything but a newer build, loading nothing', async () => {
    server.use(http.get('/version.json', () => HttpResponse.error()));
    expect(await outcome(loadChunkOrReload(chunk(2)))).toMatchObject({
      failure: 'offline',
    });
    expect(reloadPage).not.toHaveBeenCalled();
  });
});

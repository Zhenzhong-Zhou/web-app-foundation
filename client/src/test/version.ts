import { act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';

import { API_REVISION } from '../api/revision.gen';
import { BUILD } from '../version/build';
import { checkVersion } from '../version/version-check';
import { apiError } from './handlers';
import { server } from './setup';

/**
 * A deploy, as a tab sees it (ADR-081): the static host's version.json
 * names `build` rather than the build the tests run as, at this client's
 * API revision, or one above it when the new version's saves would be
 * refused (`urgent`). Served until the test ends; setup.ts puts this tab's
 * own build back after it.
 */
export function serveVersion({
  build = 'a1b2c3d',
  urgent = false,
}: { build?: string; urgent?: boolean } = {}) {
  server.use(
    http.get('/version.json', () =>
      HttpResponse.json({
        ...BUILD,
        build,
        apiRevision: API_REVISION + (urgent ? 1 : 0),
      }),
    ),
  );
}

/**
 * A deploy, and the file read at once, as coming back to the front reads
 * it.
 */
export async function deploy(options?: { build?: string; urgent?: boolean }) {
  serveVersion(options);
  await act(() => checkVersion());
}

/** What the API says to an outdated tab (ADR-081), in its own words. */
export const OUTDATED =
  'This tab is running an older version of the app, so nothing was saved. Copy anything you typed, then reload.';

/** The API refusing this tab's revision as outdated (ADR-081). */
export const outdatedRefusal = () => apiError(409, OUTDATED, 'client_outdated');

import {
  type Breadcrumb,
  breadcrumbsIntegration,
  type BrowserOptions,
  captureException,
  dedupeIntegration,
  type ErrorEvent,
  eventFiltersIntegration,
  globalHandlersIntegration,
  httpContextIntegration,
  init,
  linkedErrorsIntegration,
} from '@sentry/browser';

import { BUILD } from '../version/build';
import { isFault, MAX_REPORTS, type SendFault } from './report-fault';

/**
 * The project the browser's reports name: a stand-in on a host that cannot
 * resolve, which the server replaces with its own setting's before relaying
 * (ADR-084). The browser holds no address of the tracker's.
 */
const STAND_IN = 'https://public@errors.invalid/1';

export interface TrackerOptions {
  /** For the tests, which record instead of sending. */
  transport?: BrowserOptions['transport'];
}

/**
 * The error tracker in the browser (ADR-084), in a chunk of its own that
 * report-fault.ts loads after the first screen has drawn. Reports go to
 * the app's own route, /api/errors, which relays them; they carry the
 * error, its stack, the release, the reference, the language, the browser
 * and the page's path, never its query, and none of the SDK's personal
 * data. Besides what reportFault hands it, the SDK's own handlers report
 * an error or a rejection no code caught. Each passes the same drops as
 * reportFault, comes from the app's own files, and is one of at most ten.
 */
export function startTracker({ transport }: TrackerOptions = {}): SendFault {
  let sent = 0;

  init({
    dsn: STAND_IN,
    tunnel: '/api/errors',
    // The route's ADR-014 header, and no X-Api-Revision: the route is
    // version-neutral, so a tab older than the API still reports.
    transportOptions: { headers: { 'X-Requested-With': 'XMLHttpRequest' } },
    release: `${BUILD.version}+${BUILD.build}`,
    // sendDefaultPii's successor in SDK 11, whose every default collects:
    // nothing personal, the browser's name aside.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ['User-Agent'] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    // "Failed to fetch" left as the browser says it, which isFault reads.
    enhanceFetchErrorMessages: false,
    sendClientReports: false,
    // None of the defaults: they add session counts, and wrap every timer
    // and listener.
    defaultIntegrations: false,
    integrations: [
      eventFiltersIntegration(),
      dedupeIntegration(),
      linkedErrorsIntegration(),
      globalHandlersIntegration(),
      httpContextIntegration(),
      // Page changes and requests; no clicks, and SDK 11 has no console's.
      breadcrumbsIntegration({ dom: false, sentry: false }),
    ],
    allowUrls: [`${window.location.origin}/`],
    initialScope: { tags: { side: 'browser' } },
    beforeBreadcrumb: withoutQueries,
    beforeSend: (event, hint) => {
      if (!isFault(hint.originalException) || sent >= MAX_REPORTS) return null;
      sent += 1;
      return scrubbed(event);
    },
    ...(transport ? { transport } : {}),
  });

  return (error, { reference }) => {
    captureException(error, reference ? { tags: { reference } } : undefined);
  };
}

/**
 * The browser's half of ADR-084's scrubbing, which the server repeats
 * before relaying: the page's path without its query, which can hold a
 * search term; of the headers, only the browser's name; and the language.
 */
function scrubbed(event: ErrorEvent): ErrorEvent {
  const { request } = event;
  const browser = request?.headers?.['User-Agent'];
  return {
    ...event,
    request: request && {
      url: request.url && withoutQuery(request.url),
      headers: browser ? { 'User-Agent': browser } : undefined,
    },
    tags: { ...event.tags, language: document.documentElement.lang },
  };
}

/** A page change's or a request's addresses, without their queries. */
function withoutQueries(breadcrumb: Breadcrumb): Breadcrumb {
  const data = { ...breadcrumb.data };
  for (const key of ['from', 'to', 'url']) {
    if (typeof data[key] === 'string') data[key] = withoutQuery(data[key]);
  }
  return { ...breadcrumb, data };
}

function withoutQuery(url: string): string {
  return url.split(/[?#]/)[0];
}

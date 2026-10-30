import * as Sentry from '@sentry/node';

import type { Env } from '../../config/env';
import { getTenantContext } from '../../database/tenant-context';
import { VERSION } from '../version';
import { scrubEvent } from './scrub';

/** What a report says of where the fault happened, each a tag (scrub.ts). */
export interface FaultContext {
  /** What a catch site was doing, in a few words: "the verification email". */
  failed?: string;
  /** The hourly job whose run failed (HourlyTimer). */
  job?: string;
  /** The route's pattern, as Express matched it: never its address. */
  route?: string;
  /** The request's id, the reference a person can quote. */
  reference?: string;
}

/** How long reports still pending may hold up an exit, a deploy's included. */
const FLUSH_MS = 2000;

/**
 * Starts the error tracker (ADR-084): from main.ts only, before the app is
 * made, so the tests, the seeds and the command-line scripts boot without
 * it. Unset, nothing starts and nothing leaves. Returns the line main.ts
 * logs, which names the environment and the release, never the address.
 *
 * Errors only: no tracing, no profiling, no session counts, and none of the
 * SDK's default integrations, which would record the requests' addresses,
 * bodies and console lines. Its own handlers report an uncaught exception
 * or an unhandled rejection, then end the process as Node would, once the
 * report is sent or two seconds have passed. `transport` is for the tests,
 * which record instead of sending.
 */
export function startTracker(
  settings: Pick<
    Env,
    'ERROR_TRACKER_DSN' | 'ERROR_TRACKER_ENVIRONMENT' | 'NODE_ENV'
  >,
  transport?: Sentry.NodeOptions['transport'],
): string {
  if (!settings.ERROR_TRACKER_DSN) {
    return 'Error tracker off: ERROR_TRACKER_DSN is unset';
  }

  const environment = settings.ERROR_TRACKER_ENVIRONMENT ?? settings.NODE_ENV;
  const release = `${VERSION}+${process.env.RENDER_GIT_COMMIT ?? 'dev'}`;
  Sentry.init({
    dsn: settings.ERROR_TRACKER_DSN,
    environment,
    release,
    // sendDefaultPii's successor in SDK 11, whose every default collects:
    // nothing personal, as the scrubbing then makes sure.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    defaultIntegrations: false,
    integrations: [
      Sentry.dedupeIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration({ mode: 'strict' }),
    ],
    shutdownTimeout: FLUSH_MS,
    initialScope: { tags: { side: 'server' } },
    beforeSend: (event) => scrubEvent(event) as Sentry.ErrorEvent,
    ...(transport ? { transport } : {}),
  });
  return `Error tracker on: environment ${environment}, release ${release}`;
}

/**
 * Reports a fault to the tracker, or does nothing while it is off: an
 * error a catch site handles and only logs, beside its log line, which
 * stays. Inside a request, or a job acting for one organization, the
 * report names the user and the organization by id; a person in no
 * organization has no tenant context, and sends neither.
 */
export function reportFault(error: unknown, context: FaultContext = {}): void {
  if (!Sentry.isInitialized()) return;

  const tenant = getTenantContext();
  Sentry.captureException(error, {
    tags: {
      ...context,
      ...(tenant ? { organization: tenant.organizationId } : {}),
    },
    user: tenant ? { id: tenant.userId } : undefined,
  });
}

/** Sends the reports still pending, for at most two seconds (AppModule). */
export async function flushFaults(): Promise<void> {
  if (Sentry.isInitialized()) await Sentry.flush(FLUSH_MS);
}

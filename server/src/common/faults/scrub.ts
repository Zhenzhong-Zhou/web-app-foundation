import type { Breadcrumb, Event, Exception, StackFrame } from '@sentry/node';

/**
 * ADR-084's "what a report carries", as one function: the server's own
 * reports pass through it before sending, and the browser's before they are
 * relayed. It copies only what the ADR lists, so a field a newer SDK adds
 * stays behind until it is named here: the error, its stack, the release,
 * the environment, the tags below, the user by id, the browser and the
 * page's path. Never a name, an email address, a postal address, an IP
 * address, a request's body, cookies, a header other than the browser's
 * name, or a query string; free text loses emails, IP addresses, queries
 * and the values in a database error's message.
 */
export function scrubEvent(event: Event): Event {
  const id = event.user?.id;
  return {
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    release: event.release,
    environment: event.environment,
    sdk: event.sdk && { name: event.sdk.name, version: event.sdk.version },
    message: event.message === undefined ? undefined : scrubText(event.message),
    exception: event.exception?.values && {
      values: event.exception.values.map(scrubException),
    },
    tags: scrubTags(event.tags),
    user: typeof id === 'string' && UUID.test(id) ? { id } : undefined,
    contexts: scrubContexts(event.contexts),
    request: event.request && {
      url: event.request.url && withoutQuery(event.request.url),
      headers: event.request.headers?.['User-Agent']
        ? { 'User-Agent': event.request.headers['User-Agent'] }
        : undefined,
    },
    breadcrumbs: event.breadcrumbs
      ?.filter(({ category }) => BREADCRUMBS.has(category ?? ''))
      .map(scrubBreadcrumb),
    // Which uploaded source map reads each browser file (ADR-084).
    debug_meta: event.debug_meta?.images && {
      images: event.debug_meta.images
        .filter((image) => image.type === 'sourcemap')
        .map(({ debug_id, code_file }) => ({
          type: 'sourcemap' as const,
          debug_id,
          code_file: withoutQuery(code_file),
        })),
    },
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The tags a report may carry, each one the app sets: `side`, `server` or
 * `browser`; `reference`, the id a person can quote, kept only when it is
 * letters, digits and hyphens, at most 64, since a caller chooses its own
 * X-Request-Id; `route`, a route's pattern, never its address; `job`, the
 * hourly job whose run failed; `failed`, what a catch site was doing; the
 * `organization` by id; and the page's `language`.
 */
const TAGS: Record<string, RegExp> = {
  side: /^(server|browser)$/,
  reference: /^[A-Za-z0-9-]{1,64}$/,
  route: /^\/[\w\-/:.*]{0,200}$/,
  job: /^\w{1,100}$/,
  failed: /^[\w ,.'-]{1,200}$/,
  organization: UUID,
  language: /^[A-Za-z-]{2,20}$/,
};

/** Page changes and requests, by path; console lines and clicks are off. */
const BREADCRUMBS = new Set(['navigation', 'fetch', 'xhr']);

function scrubTags(tags: Event['tags']): Event['tags'] {
  if (!tags) return undefined;
  return Object.fromEntries(
    Object.entries(tags).filter(
      ([name, value]) =>
        typeof value === 'string' && TAGS[name]?.test(value) === true,
    ),
  );
}

/** The operating system, the runtime and the browser, by name and version. */
function scrubContexts(contexts: Event['contexts']): Event['contexts'] {
  if (!contexts) return undefined;
  return Object.fromEntries(
    (['os', 'runtime', 'browser'] as const)
      .filter((name) => contexts[name])
      .map((name) => [
        name,
        { name: contexts[name]?.name, version: contexts[name]?.version },
      ]),
  );
}

function scrubException(exception: Exception): Exception {
  return {
    type: exception.type,
    value:
      exception.value === undefined ? undefined : scrubText(exception.value),
    module: exception.module,
    mechanism: exception.mechanism && {
      type: exception.mechanism.type,
      handled: exception.mechanism.handled,
      synthetic: exception.mechanism.synthetic,
      source: exception.mechanism.source,
      exception_id: exception.mechanism.exception_id,
      parent_id: exception.mechanism.parent_id,
      is_exception_group: exception.mechanism.is_exception_group,
    },
    stacktrace: exception.stacktrace?.frames && {
      frames: exception.stacktrace.frames.map(scrubFrame),
    },
  };
}

/** Where each line ran; never its local variables. */
function scrubFrame(frame: StackFrame): StackFrame {
  return {
    filename: frame.filename && withoutQuery(frame.filename),
    abs_path: frame.abs_path && withoutQuery(frame.abs_path),
    module: frame.module,
    function: frame.function,
    lineno: frame.lineno,
    colno: frame.colno,
    in_app: frame.in_app,
  };
}

function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data = breadcrumb.data ?? {};
  const path = (value: unknown) =>
    typeof value === 'string' ? withoutQuery(value) : undefined;
  return {
    timestamp: breadcrumb.timestamp,
    category: breadcrumb.category,
    type: breadcrumb.type,
    level: breadcrumb.level,
    data: {
      from: path(data.from),
      to: path(data.to),
      url: path(data.url),
      method: typeof data.method === 'string' ? data.method : undefined,
      status_code:
        typeof data.status_code === 'number' ? data.status_code : undefined,
    },
  };
}

/** An address without its query or fragment, which can hold a search term. */
function withoutQuery(url: string): string {
  return url.split(/[?#]/)[0];
}

/**
 * Free text, an error's message, without what may name a person: emails,
 * IP addresses, queries, and the values a database error quotes. A name or
 * a postal address in free text has no shape to find, so it is kept out
 * where the text is written: a catch site reports the error itself, whose
 * message the code wrote (ADR-084). At most MAX_TEXT of it is kept, cut
 * after the rules have run, so a cut never leaves half an email behind.
 */
export function scrubText(text: string): string {
  const scrubbed = TEXT_RULES.reduce(
    (scrubbing, [pattern, replacement]) =>
      scrubbing.replace(pattern, replacement),
    text,
  );
  return scrubbed.length > MAX_TEXT
    ? `${scrubbed.slice(0, MAX_TEXT)}…`
    : scrubbed;
}

/** A message's most, in characters: its start is what reads it. */
const MAX_TEXT = 8 * 1024;

/**
 * Each rule takes time in step with the text's length, as the route takes
 * up to 200 KB from anyone: a match starts only where one can, and never
 * reads on past where the next one starts. Retried from every position, a
 * pattern took seconds on one long word (scrub.spec.ts).
 */
const TEXT_RULES: [RegExp, string][] = [
  // Only where a run of an address's characters starts.
  [/(?<![^\s@"'<>()])[^\s@"'<>()]+@[^\s@"'<>()]+\.[^\s@"'<>()]+/g, '[email]'],
  // An address's query, from its ? to the next space or quote; a ? that
  // ends a question has no = after it.
  [/\?[^\s"'?]*=[^\s"']*/g, ''],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]'],
  // IPv6, in full or shortened by ::, but not a time such as 05:10:00.
  [/(?<![\w:])(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}(?![\w:])/gi, '[ip]'],
  [
    /(?<![\w:])(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?|::[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)(?![\w:])/gi,
    '[ip]',
  ],
  // Postgres quotes a value after a colon, `value` or `near`:
  //   invalid input syntax for type uuid: "…"; value "…" is out of range;
  //   syntax error at or near "…". A constraint's or a column's name, quoted
  //   after its own word, stays.
  [/(: |\bvalue |\bnear )"[^"]*"/g, '$1"[value]"'],
  // Its detail, when a driver puts it in the message: Key (email)=(…).
  // Its columns end before the next detail starts.
  [/\bKey \(((?:(?!Key \().)+?)\)=\(.*\)/g, 'Key ($1)=([value])'],
  [
    /\bFailing row contains \((?:(?!Failing row contains \().)*\)/g,
    'Failing row contains ([value])',
  ],
  // Drizzle's "Failed query: …" names its parameters' values after "params:".
  [/\bparams: .*/g, 'params: [value]'],
];

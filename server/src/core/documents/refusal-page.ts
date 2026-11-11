import { darkAccent, ON_DARK_ACCENT } from '../../common/dark-accent';
import { ERROR_CODES } from '../../common/error-codes';
import type { ErrorBody } from '../../common/filters/all-exceptions.filter';
import type { Locale } from '../../common/locales';
import {
  t,
  type Translatable,
  translate,
  translateParts,
} from '../../i18n/translate';
import { escapeHtml } from '../../shared/mail/escape-html';

/**
 * Each document's own page in the app, the way back from its PDF's
 * refusal (ADR-071, amended for #526): the order for the order's four,
 * the purchase order, the pro forma and the packing slip; the invoice,
 * the credit note and the return authorization for theirs. Its 404's
 * title is the app's own where the app has one.
 */
const DOCUMENT_PAGES = {
  '/orders/:id': {
    back: t({
      id: 'documents.refusal.backToOrder',
      defaultMessage: 'Back to the order',
    }),
    missing: t({
      id: 'documents.refusal.orderMissing',
      defaultMessage: 'This order doesn’t exist',
    }),
  },
  '/invoices/:id': {
    back: t({
      id: 'documents.refusal.backToInvoice',
      defaultMessage: 'Back to the invoice',
    }),
    missing: t({
      id: 'documents.refusal.invoiceMissing',
      defaultMessage: 'This invoice doesn’t exist',
    }),
  },
  '/credit-notes/:id': {
    back: t({
      id: 'documents.refusal.backToCreditNote',
      defaultMessage: 'Back to the credit note',
    }),
    missing: t({
      id: 'documents.refusal.creditNoteMissing',
      defaultMessage: 'This credit note doesn’t exist',
    }),
  },
  '/return-authorizations/:id': {
    back: t({
      id: 'documents.refusal.backToReturnAuthorization',
      defaultMessage: 'Back to the return authorization',
    }),
    missing: t({
      id: 'documents.refusal.returnAuthorizationMissing',
      defaultMessage: 'This return doesn’t exist',
    }),
  },
} satisfies Record<string, { back: Translatable; missing: Translatable }>;

/** A document's page in the app, as PdfResponse names it. */
export type DocumentPage = keyof typeof DOCUMENT_PAGES;

/**
 * The status pages' kinds the page can be (conventions.md, "Status
 * pages"), each its icon, Material's outlined one as the app draws it, on
 * its tone: calm for what is not there, amber for what is not yours, red
 * only for a real failure.
 */
const LOOKS = {
  missing: {
    tone: 'info',
    icon: 'M8 16h8v2H8zm0-4h8v2H8zm6-10H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8zm4 18H6V4h7v5h5z',
  },
  forbidden: {
    tone: 'warning',
    icon: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2M9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9zm9 14H6V10h12zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2',
  },
  crash: {
    tone: 'critical',
    icon: 'M12 5.99 19.53 19H4.47zM12 2 1 21h22zm1 14h-2v2h2zm0-6h-2v4h2z',
  },
} as const;

/**
 * ADR-055's colours, copied from client/src/theme/tokens.ts, since the
 * packages share no code: a change there is made here too. The page,
 * panel, border, text and muted text of each scheme, the accent with the
 * text on it, and the three tones' tint and text.
 */
const LIGHT = {
  page: '#F6F7F9',
  surface: '#FFFFFF',
  border: '#E1E4EA',
  text: '#141A24',
  muted: '#5B6575',
  /** BRAND.accent. */
  accent: '#5546B8',
  /** ON_ACCENT.light. */
  onAccent: '#FFFFFF',
  info: ['#EAF0FB', '#1B4374'],
  warning: ['#FDF3DC', '#6E4300'],
  critical: ['#FDEBE8', '#8A1B12'],
} as const;

const DARK = {
  page: '#161A21',
  surface: '#1E232C',
  border: '#2E3440',
  text: '#E6E9EF',
  muted: '#A3ACBA',
  /** The dark accent, worked out from the light one as the app does. */
  accent: darkAccent(LIGHT.accent),
  onAccent: ON_DARK_ACCENT,
  info: ['#1D2B40', '#A9C6F0'],
  warning: ['#3A2E14', '#F2CF85'],
  critical: ['#3A1F1C', '#F4B4AA'],
} as const;

function colours(scheme: typeof LIGHT | typeof DARK): string {
  return [
    `--page:${scheme.page}`,
    `--surface:${scheme.surface}`,
    `--border:${scheme.border}`,
    `--text:${scheme.text}`,
    `--muted:${scheme.muted}`,
    `--accent:${scheme.accent}`,
    `--on-accent:${scheme.onAccent}`,
    ...(['info', 'warning', 'critical'] as const).flatMap((tone) => [
      `--${tone}-bg:${scheme[tone][0]}`,
      `--${tone}-fg:${scheme[tone][1]}`,
    ]),
  ].join(';');
}

/**
 * The standalone status page's measures (status-page.tsx, theme/index.ts):
 * a panel on the page, its icon in a 64 px circle, the title at 25 px,
 * the message at 20 px, every other line at 16 px, and links a fingertip
 * high on touch (ADR-079). The system's own font, as the emails use: the
 * app's is served by the app, not here. Chinese reads with more room
 * between lines (ADR-091).
 */
function styles(locale: Locale): string {
  const leading = locale === 'zh-Hans' ? 1.75 : 1.5;
  return `
:root{color-scheme:light dark;${colours(LIGHT)}}
@media (prefers-color-scheme:dark){:root{${colours(DARK)}}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;background:var(--page);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif;font-size:16px;line-height:${leading}}
main{width:100%;max-width:480px;padding:40px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;background:var(--surface);border:1px solid var(--border);border-radius:12px}
@media (max-width:599.95px){main{padding:24px}}
.icon{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.icon svg{width:35px;height:35px;fill:currentColor}
.info{background:var(--info-bg);color:var(--info-fg)}
.warning{background:var(--warning-bg);color:var(--warning-fg)}
.critical{background:var(--critical-bg);color:var(--critical-fg)}
h1{margin:0;font-size:25px;line-height:32px;font-weight:700}
p{margin:0}
.message{color:var(--muted);font-size:20px;overflow-wrap:anywhere}
.links{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;padding-top:4px}
.links a{display:inline-flex;align-items:center;justify-content:center;max-width:100%;min-height:36px;padding:6px 16px;border:1px solid var(--accent);border-radius:10px;color:var(--accent);font-weight:600;text-decoration:none}
.links a.main{background:var(--accent);color:var(--on-accent)}
.links a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media (pointer:coarse){.links a{min-height:44px}}
.reference{color:var(--muted)}
.reference code{font-family:ui-monospace,Menlo,Consolas,monospace;user-select:all}
`;
}

const SIGNED_OUT = t({
  id: 'documents.refusal.signedOut',
  defaultMessage: 'You’re signed out',
});
const FORBIDDEN = t({
  id: 'documents.refusal.forbidden',
  defaultMessage: 'You don’t have access to this',
});
const REFUSED = t({
  id: 'documents.refusal.cannotMake',
  defaultMessage: 'Can’t make this PDF',
});
const CRASH = t({
  id: 'documents.refusal.crash',
  defaultMessage: 'Something went wrong',
});
/**
 * A fault's own message says nothing a person can act on, the generic
 * "Internal server error" or a developer's sentence, so the page says what
 * to do instead, as the app's crash page does.
 */
const CRASH_MESSAGE = t({
  id: 'documents.refusal.crashMessage',
  defaultMessage:
    'The PDF couldn’t be made. Try again in a minute. If it happens again, send the reference below.',
});
const SIGN_IN = t({
  id: 'documents.refusal.signIn',
  defaultMessage: 'Sign in',
});
const OPEN_ITEM = t({
  id: 'documents.refusal.openItem',
  defaultMessage: 'Open the item',
});

/**
 * Which status page a refusal is, worked out once from its status: the
 * look, the title, the message, the way back's words and the reference
 * each follow from it.
 */
type Kind = 'signedOut' | 'forbidden' | 'missing' | 'refused' | 'crash';

function kindOf(status: number): Kind {
  if (status >= 500) return 'crash';
  if (status === 401) return 'signedOut';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'missing';
  return 'refused';
}

/** What the page is made from. */
export interface Refusal {
  /** The refusal as the API's JSON carries it, its message in `locale`. */
  body: ErrorBody;
  locale: Locale;
  /** The document's page, for the way back's words. */
  page: DocumentPage;
  /** That page's path, filled from the route's own parameters. */
  back: string;
  /** The app's address, CLIENT_URL, which each link starts from. */
  app: string;
}

/**
 * The page a refused PDF answers a page visit with (ADR-071, amended for
 * #526): the status pages' shape, its kind's icon, a title as its one
 * heading, the refusal's message, then the way out where the refusal
 * carries one and the way back, and a failure's reference. Every word that
 * can hold typed text, a code or a name in the message, is escaped; the
 * page holds no script.
 */
export function refusalPage({
  body,
  locale,
  page,
  back,
  app,
}: Refusal): string {
  const document = DOCUMENT_PAGES[page];
  const words = (message: Translatable) => translate(message, locale);

  const kind = kindOf(body.statusCode);
  const { look, title } = {
    signedOut: { look: LOOKS.forbidden, title: SIGNED_OUT },
    forbidden: { look: LOOKS.forbidden, title: FORBIDDEN },
    missing: { look: LOOKS.missing, title: document.missing },
    refused: { look: LOOKS.missing, title: REFUSED },
    crash: { look: LOOKS.crash, title: CRASH },
  }[kind];
  const heading = words(title);
  const messages =
    kind === 'crash' ? [words(CRASH_MESSAGE)] : [body.message].flat();

  // The way out first, as the main link, where the refusal has one.
  const item =
    body.code === ERROR_CODES.itemNameMissing
      ? body.details?.productId
      : undefined;
  const links = [
    ...(item
      ? [{ href: `${app}/items/${encodeURIComponent(item)}`, label: OPEN_ITEM }]
      : []),
    // After a 401 the app signs the person in and returns there.
    { href: app + back, label: kind === 'signedOut' ? SIGN_IN : document.back },
  ];

  const reference =
    kind === 'crash' && body.requestId
      ? translateParts(
          t(
            {
              id: 'documents.refusal.reference',
              defaultMessage: 'Reference: {requestId}',
            },
            { requestId: body.requestId },
          ),
          locale,
          { requestId: { code: body.requestId } },
        )
          .map((part) =>
            typeof part === 'string'
              ? escapeHtml(part)
              : `<code>${escapeHtml(part.code)}</code>`,
          )
          .join('')
      : null;

  return [
    '<!doctype html>',
    `<html lang="${locale}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    `<title>${escapeHtml(heading)}</title>`,
    `<style>${styles(locale)}</style>`,
    '</head>',
    '<body>',
    '<main>',
    `<div class="icon ${look.tone}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="${look.icon}"/></svg></div>`,
    `<h1>${escapeHtml(heading)}</h1>`,
    ...messages.map(
      (message) => `<p class="message">${escapeHtml(message)}</p>`,
    ),
    '<div class="links">',
    ...links.map(
      ({ href, label }, index) =>
        `<a${index === 0 ? ' class="main"' : ''} href="${escapeHtml(href)}">${escapeHtml(words(label))}</a>`,
    ),
    '</div>',
    ...(reference ? [`<p class="reference">${reference}</p>`] : []),
    '</main>',
    '</body>',
    '</html>',
  ].join('\n');
}

import type { Locale } from '../../common/locales';
import { t, translate } from '../../i18n/translate';
import { escapeHtml } from './escape-html';
import type { Mail } from './mail.service';

/**
 * The colours an email sets (ADR-083), copied from the client's
 * client/src/theme/tokens.ts, since the packages share no code: a change
 * there is made here too. Only the rules, the button, links, the note's
 * box and the small print have one; the page and the text take the mail
 * app's own, its dark ones too.
 */
const LIGHT = {
  /** BRAND.accent. */
  accent: '#5546B8',
  /** ON_ACCENT.light. */
  onAccent: '#FFFFFF',
  /** LIGHT.muted, 5.9 : 1 on white. */
  muted: '#5B6575',
  /** LIGHT.line: the header's rule and the footer's. */
  rule: '#EEF0F4',
  /** LIGHT.border: the note's box. */
  border: '#E1E4EA',
} as const;

/** What a dark mail app shows instead (ADR-083's amendment). */
const DARK = {
  /** The app's dark accent, towardWhite(BRAND.accent, DARK_ACCENT_WEIGHT). */
  accent: '#A299D8',
  /** ON_ACCENT.dark. */
  onAccent: '#10141A',
  /** DARK.muted. */
  muted: '#A3ACBA',
  /** The boards' rule on a dark mail app's ground, which no token has. */
  rule: '#3A3F48',
} as const;

/** RADIUS.control, the button's corners, and RADIUS.panel, the note's. */
const RADIUS = { control: 6, panel: 8 } as const;

/** The system's own font, with Chinese ones for a Chinese email. */
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
/**
 * Outlook on Windows alone: it falls back to Times New Roman when the
 * first font named is not installed, rather than trying the next.
 */
const OUTLOOK_FONT = "Arial, 'Microsoft YaHei', sans-serif";

const BODY = 'font-size:16px;line-height:1.6';
const SMALL = `font-size:14px;line-height:1.5;color:${LIGHT.muted}`;
const LINK = `color:${LIGHT.accent};text-decoration:underline`;

/** Words in a sentence, or words that are a link. */
export type Run = string | { text: string; href: string };

/**
 * What an email is made of (ADR-083). Each block writes itself into both
 * parts, so the HTML and the text cannot disagree. Where the text part
 * words a block its own way, as it did before the layout, the block holds
 * those words beside its own.
 */
export type MailBlock =
  /** The product's (ADR-082): the mark, once it answers, and the name. */
  | { kind: 'header'; name: string; mark: string | null }
  /** A product email's is its subject, in the HTML part only. */
  | { kind: 'heading'; text: string; htmlOnly?: boolean }
  | { kind: 'greeting'; text: string }
  /** `plain` is the text part's words, where they differ. */
  | { kind: 'paragraph'; text: string | Run[]; plain?: string }
  /**
   * The email's one action. The text part gives `lead`, the label unless
   * said, with the address on the line under it.
   */
  | { kind: 'button'; label: string; href: string; lead?: string }
  /** A label and a value per row: a table of data, not of layout. */
  | { kind: 'details'; rows: [label: string, value: string][] }
  /** Someone's own words in a box, under whose they are. */
  | { kind: 'quote'; title: string; text: string }
  | { kind: 'small'; text: string }
  /** An address written out as its own link. */
  | { kind: 'link'; href: string }
  /** The last line, in small print under a rule. */
  | { kind: 'footer'; text: string };

/** An email as blocks, in the language it is written in. */
export interface MailContent {
  to: string;
  subject: string;
  locale: Locale;
  blocks: MailBlock[];
}

/**
 * Rules a mail app may drop without losing anything: some Gmail apps strip
 * `<style>`, so everything an email needs is inline. A phone's narrower
 * padding and full-width button, then dark mail apps' colours, by class,
 * under the media query Apple Mail honours and Outlook.com's own
 * attributes for its dark mode.
 */
const DARK_RULES: [selector: string, rule: string][] = [
  ['.muted', `color: ${DARK.muted}`],
  ['.link', `color: ${DARK.accent}`],
  ['.button td', `background-color: ${DARK.accent}`],
  ['.button a', `color: ${DARK.onAccent}`],
  ['.rule', `border-color: ${DARK.rule}`],
];
const STYLE = [
  '@media (max-width: 479px) {',
  '  .column { padding-left: 16px !important; padding-right: 16px !important; }',
  '  .button { width: 100% !important; }',
  '  .button a { display: block !important; }',
  '}',
  '@media (prefers-color-scheme: dark) {',
  ...DARK_RULES.map(
    ([selector, rule]) => `  ${selector} { ${rule} !important; }`,
  ),
  '}',
  ...DARK_RULES.map(
    ([selector, rule]) =>
      `[data-ogsc] ${selector}, [data-ogsb] ${selector} { ${rule} !important; }`,
  ),
].join('\n');

/**
 * What follows the preheader, so an inbox's preview ends with it rather
 * than running on into the email: characters that show nothing, which no
 * inbox collapses.
 */
const PADDING = '&#847;&zwnj;&nbsp;'.repeat(90);

/**
 * An email's HTML and text parts from its blocks (ADR-083). The HTML is a
 * whole document in the email's language: one column, at most 600 px, the
 * full width on a phone, with a fixed 600 px table for Outlook on Windows,
 * which ignores `max-width`; one article to a screen reader; a hidden
 * preheader for the inbox's preview; and, under a button, the address to
 * copy, in small print last, before the footer. The text part is the
 * blocks' words, a blank line between each.
 *
 * Every value is escaped here, attributes too: the only markup an email
 * holds is this builder's.
 */
export function writeMail({ blocks, locale, ...mail }: MailContent): Mail {
  return {
    ...mail,
    html: htmlOf(mail.subject, locale, blocks),
    text: blocks
      .map(textOf)
      .filter((part): part is string => part !== null)
      .join('\n\n'),
  };
}

function textOf(block: MailBlock): string | null {
  switch (block.kind) {
    case 'header':
      return block.name;
    case 'heading':
      return block.htmlOnly ? null : block.text;
    case 'greeting':
    case 'small':
    case 'footer':
      return block.text;
    case 'paragraph':
      return block.plain ?? wordsOf(block.text);
    case 'button':
      return `${block.lead ?? block.label}\n${block.href}`;
    case 'details':
      return block.rows
        .map(([label, value]) => `${label}: ${value}`)
        .join('\n');
    case 'quote':
      return `${block.title}\n${block.text}`;
    case 'link':
      return block.href;
  }
}

function htmlOf(subject: string, locale: Locale, blocks: MailBlock[]): string {
  const button = blocks.find((block) => block.kind === 'button');
  const rows = [
    ...blocks.filter((block) => block.kind !== 'footer').map(blockHtml),
    ...(button ? [addressLine(button.href, locale)] : []),
    ...blocks.filter((block) => block.kind === 'footer').map(blockHtml),
  ];
  const lang = escapeHtml(locale);
  const label = escapeHtml(subject);

  return [
    '<!doctype html>',
    `<html lang="${lang}" dir="ltr">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    '<meta name="supported-color-schemes" content="light dark">',
    '<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">',
    '<meta name="x-apple-disable-message-reformatting">',
    `<title>${label}</title>`,
    `<style>\n${STYLE}\n</style>`,
    `<!--[if mso]><style>body, table, td, th, p, h1, a, span, strong { font-family: ${OUTLOOK_FONT} !important; }</style><![endif]-->`,
    '</head>',
    '<body style="margin:0;padding:0">',
    `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(preheaderOf(blocks, locale))}${PADDING}</div>`,
    // lang and dir again: Gmail drops <html> and its attributes.
    `<div role="article" aria-roledescription="email" aria-label="${label}" lang="${lang}" dir="ltr" style="font-family:${FONT};${BODY}">`,
    '<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;border-collapse:collapse">',
    // A row to a block, 16 px apart: padding on a cell, which every mail
    // app draws alike, where margins are not.
    ...rows.map((html, index) => {
      const top = index === 0 ? 24 : 16;
      const bottom = index === rows.length - 1 ? 24 : 0;
      return `<tr><td class="column" style="padding:${top}px 24px ${bottom}px;${BODY}">${html}</td></tr>`;
    }),
    '</table>',
    '<!--[if mso]></td></tr></table><![endif]-->',
    '</div>',
    '</body>',
    '</html>',
  ].join('\n');
}

function blockHtml(block: MailBlock): string {
  switch (block.kind) {
    case 'header': {
      const cell = `padding:0 0 16px;border-bottom:1px solid ${LIGHT.rule};vertical-align:middle`;
      // Its alt empty: the name beside it says the same, so a mail app
      // that blocks images loses nothing.
      const mark = block.mark
        ? `<td class="rule" style="${cell};padding-right:10px"><img src="${escapeHtml(block.mark)}" width="28" height="28" alt="" style="display:block;border:0"></td>`
        : '';
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr>${mark}<td class="rule" width="100%" style="${cell};font-size:20px;font-weight:700;line-height:28px">${escapeHtml(block.name)}</td></tr></table>`;
    }
    case 'heading':
      return `<h1 style="margin:0;font-size:22px;font-weight:700;line-height:1.3">${escapeHtml(block.text)}</h1>`;
    case 'greeting':
      return `<p style="margin:0">${escapeHtml(block.text)}</p>`;
    case 'paragraph': {
      const runs = typeof block.text === 'string' ? [block.text] : block.text;
      const html = runs
        .map((run) =>
          typeof run === 'string'
            ? escapeHtml(run)
            : linkHtml(run.href, run.text),
        )
        .join('');
      return `<p style="margin:0">${html}</p>`;
    }
    case 'button':
      // The padding on the link, so the whole button is clickable, and on
      // the cell for Outlook, which pads no link and rounds no corner.
      return `<table role="presentation" class="button" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" style="background-color:${LIGHT.accent};border-radius:${RADIUS.control}px;mso-padding-alt:10px 22px"><a href="${escapeHtml(block.href)}" style="display:inline-block;padding:10px 22px;color:${LIGHT.onAccent};font-size:16px;font-weight:600;line-height:24px;text-decoration:none;border-radius:${RADIUS.control}px">${escapeHtml(block.label)}</a></td></tr></table>`;
    case 'details': {
      const cell = `padding:4px 12px 4px 0;vertical-align:top;${BODY}`;
      // A label kept whole: on a phone a long value would break 浏览器.
      const rows = block.rows.map(
        ([label, value]) =>
          `<tr><th scope="row" class="muted" style="${cell};text-align:left;font-weight:400;white-space:nowrap;color:${LIGHT.muted}">${escapeHtml(label)}</th><td style="${cell}">${escapeHtml(value)}</td></tr>`,
      );
      return `<table style="border-collapse:collapse">${rows.join('')}</table>`;
    }
    case 'quote': {
      // Its line breaks kept, each line escaped.
      const lines = block.text.split(/\r?\n/).map(escapeHtml).join('<br>');
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td class="rule" style="padding:12px 16px;border:1px solid ${LIGHT.border};border-radius:${RADIUS.panel}px;${BODY}"><strong>${escapeHtml(block.title)}</strong><br>${lines}</td></tr></table>`;
    }
    case 'small':
      return `<p class="muted" style="margin:0;${SMALL}">${escapeHtml(block.text)}</p>`;
    case 'link':
      return `<p style="margin:0">${linkHtml(block.href, block.href)}</p>`;
    case 'footer':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td class="rule muted" style="padding:16px 0 0;border-top:1px solid ${LIGHT.rule};${SMALL}">${escapeHtml(block.text)}</td></tr></table>`;
  }
}

function linkHtml(href: string, text: string): string {
  return `<a class="link" href="${escapeHtml(href)}" style="${LINK}">${escapeHtml(text)}</a>`;
}

/**
 * The button's address to copy, for a mail app where it does not open, in
 * the HTML part only: the text part already gives the address on a line of
 * its own. The address breaks anywhere, so a long one never widens a
 * phone's column. The catalogue check holds every language to `{link}`.
 */
function addressLine(href: string, locale: Locale): string {
  const sentence = translate(
    t(
      {
        id: 'mail.button.fallback',
        defaultMessage:
          'If the button doesn’t open, copy this address into your browser: {link}',
      },
      { link: href },
    ),
    locale,
  );
  const at = sentence.lastIndexOf(href);
  const address = `<span style="word-break:break-all">${escapeHtml(href)}</span>`;
  return `<p class="muted" style="margin:0;${SMALL}">${escapeHtml(sentence.slice(0, at))}${address}${escapeHtml(sentence.slice(at + href.length))}</p>`;
}

/**
 * What the inbox's preview shows after the subject: the first sentence
 * after the greeting, or the email's first where it has none, and a
 * button's words where it comes first. Without it, every inbox would show
 * the header's name and the greeting.
 */
function preheaderOf(blocks: MailBlock[], locale: Locale): string {
  const first = blocks.find(
    (block) => block.kind === 'paragraph' || block.kind === 'button',
  );
  if (!first) return '';
  if (first.kind === 'button') return first.label;
  const [sentence] = new Intl.Segmenter(locale, {
    granularity: 'sentence',
  }).segment(wordsOf(first.text));
  return sentence?.segment.trim() ?? '';
}

function wordsOf(text: string | Run[]): string {
  return typeof text === 'string'
    ? text
    : text.map((run) => (typeof run === 'string' ? run : run.text)).join('');
}

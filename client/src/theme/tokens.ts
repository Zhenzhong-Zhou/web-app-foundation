/**
 * The design's named values (ADR-055), in two layers.
 *
 * Brand: what a rebrand changes, and later what an organization sets —
 * the accent and the corner radius. Semantic: surfaces, text, borders and
 * the five status tones, in light and dark. No brand value reaches a
 * semantic one, so no accent can make a warning unreadable or change what
 * "expiring" looks like.
 *
 * Components never write these values. The theme (index.ts) turns them
 * into MUI's palette, and components ask the palette by name:
 * `color: 'text.secondary'`, `<Chip color="warning">`.
 *
 * Every pair a reader has to read is checked for WCAG AA contrast in
 * tokens.test.ts; a new token adds its pair there.
 */

/**
 * What a rebrand changes: the accent (primary buttons, links, the selected
 * tab) and the sidebar's shade.
 *
 * The emails keep a copy of the accent in
 * server/src/shared/mail/mail-layout.ts (ADR-083), and work out its dark
 * version from it as this file does, since the packages share no code: a
 * change to the accent is made to both, as ADR-082 asks of the brand's
 * colours.
 */
export const BRAND = { accent: '#5546B8', rail: 'dark' } as const;

/**
 * The sidebar's colours (ADR-055). Dark by default, which the people who
 * compared the mockups preferred; the light rail is the brand's other
 * choice, for a logo or a brand that wants it. The rail keeps its shade in
 * both colour modes, slightly deeper in dark so it still reads as a rail.
 */
export interface Rail {
  bg: string;
  /** Labels and icons. */
  text: string;
  /** The current page's label, and labels under the pointer. */
  strong: string;
  /** Group headings: quieter than the labels. */
  muted: string;
  hover: string;
  active: string;
  divider: string;
}

export const RAILS: Record<'dark' | 'light', { light: Rail; dark: Rail }> = {
  dark: {
    light: {
      bg: '#1C2230',
      text: '#C9D0DC',
      strong: '#FFFFFF',
      muted: '#98A1B0',
      hover: 'rgba(255, 255, 255, 0.06)',
      active: 'rgba(255, 255, 255, 0.12)',
      divider: 'rgba(255, 255, 255, 0.08)',
    },
    dark: {
      bg: '#101318',
      text: '#C9D0DC',
      strong: '#FFFFFF',
      muted: '#98A1B0',
      hover: 'rgba(255, 255, 255, 0.06)',
      active: 'rgba(255, 255, 255, 0.12)',
      divider: 'rgba(255, 255, 255, 0.08)',
    },
  },
  light: {
    light: {
      bg: '#FFFFFF',
      text: '#3A4352',
      strong: '#141A24',
      muted: '#5B6575',
      hover: 'rgba(20, 26, 36, 0.05)',
      active: 'rgba(20, 26, 36, 0.09)',
      divider: '#E1E4EA',
    },
    dark: {
      bg: '#1E232C',
      text: '#C9D0DC',
      strong: '#FFFFFF',
      muted: '#A3ACBA',
      hover: 'rgba(255, 255, 255, 0.06)',
      active: 'rgba(255, 255, 255, 0.12)',
      divider: '#2E3440',
    },
  },
};

/**
 * The product's mark (ADR-082), as docs/brand's masters draw it: a navy
 * stem and a purple bowl on light ground, panivo-mark.svg, and a white stem
 * and a lighter bowl on dark, panivo-mark-on-dark.svg. Its purple and navy
 * are the default accent and the dark rail, so a change to one is made to
 * the other, the masters and the files made from them too.
 */
export const MARK = {
  light: { bowl: BRAND.accent, stem: RAILS.dark.light.bg },
  onDark: { bowl: '#776BC6', stem: '#FFFFFF' },
} as const;

/**
 * The mark's shape, as the same masters draw it: a bowl and a stem in a
 * 100 × 100 box, moved by `transform` to sit in its middle. ProductMark
 * draws it, and so does index.html's loading mark, filled in from here by
 * vite.config.ts.
 */
export const MARK_SHAPE = {
  transform: 'translate(-2 -1)',
  bowl: 'M24 12H54A26 26 0 0 1 54 64H40Z',
  stem: 'M24 12V76A14 14 0 0 0 52 76A87.142857 87.142857 0 0 0 24 12Z',
} as const;

/**
 * Controls, then panels. Chips are round.
 *
 * The emails keep a copy of control and panel, the button's corners and
 * the note's, in server/src/shared/mail/mail-layout.ts: a change to either
 * is made there too.
 */
export const RADIUS = { control: 6, panel: 8, dialog: 10 } as const;

/**
 * A colour mixed toward white by `weight` (0 to 1). Dark mode's accent is
 * worked out from the brand colour this way rather than chosen, so any
 * accent, an organization's included, gets a dark version that reads on a
 * dark surface and carries dark text.
 */
export function towardWhite(hex: string, weight: number): string {
  const value = parseInt(hex.slice(1), 16);
  const channels = [value >> 16, (value >> 8) & 255, value & 255];
  const toHex = (channel: number) => channel.toString(16).padStart(2, '0');

  const mixed = channels.map((channel) =>
    toHex(Math.round(channel + (255 - channel) * weight)),
  );
  return `#${mixed.join('')}`.toUpperCase();
}

/**
 * How much of the accent dark mode keeps.
 *
 * The server keeps a copy in server/src/common/dark-accent.ts, from which
 * an organization's dark accent and the emails' are worked out: a change
 * to the weight is made there too.
 */
export const DARK_ACCENT_WEIGHT = 0.45;

/**
 * A colour laid over another at `weight` (0 to 1), as an opaque colour:
 * what the eye sees of a tint on its ground, so its contrast can be
 * checked.
 */
export function mix(colour: string, ground: string, weight: number): string {
  const channels = (hex: string) => {
    const value = parseInt(hex.slice(1), 16);
    return [value >> 16, (value >> 8) & 255, value & 255];
  };
  const over = channels(colour);
  const mixed = channels(ground).map((channel, index) =>
    Math.round(channel + (over[index] - channel) * weight)
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${mixed.join('')}`.toUpperCase();
}

/**
 * How much of the accent a chosen card's panel takes, such as the role
 * chosen on Invite (ADR-077): enough to mark it beside its border, little
 * enough that its text reads as on any panel, whatever the accent.
 */
export const CHOSEN_WEIGHT = 0.06;

/**
 * Text on the accent: white on the light accent, near black on the dark.
 *
 * The server keeps a copy of both, the light in
 * server/src/shared/mail/mail-layout.ts and the dark in
 * server/src/common/dark-accent.ts: a change to either is made there too.
 */
export const ON_ACCENT = { light: '#FFFFFF', dark: '#10141A' } as const;

export type ToneName = 'neutral' | 'info' | 'positive' | 'warning' | 'critical';

/** A status chip's colours: tinted background, text, edge. */
export interface Tone {
  bg: string;
  fg: string;
  border: string;
}

/** MUI's own intents, kept for alerts, icons and coloured text. */
export interface Intents {
  success: string;
  warning: string;
  error: string;
  info: string;
}

export interface Scheme {
  /** Behind everything; panels sit on it. */
  page: string;
  /** Panels, tables, dialogs. */
  surface: string;
  /** Table heads. */
  head: string;
  /** Panel edges and dividers. */
  border: string;
  /** Lines between table rows, fainter than a border. */
  line: string;
  text: string;
  /** Secondary text: labels, captions, notes. */
  muted: string;
  intents: Intents;
  tones: Record<ToneName, Tone>;
}

export const LIGHT: Scheme = {
  page: '#F6F7F9',
  surface: '#FFFFFF',
  head: '#F6F7F9',
  /** The emails keep a copy (mail-layout.ts): a change is made to both. */
  border: '#E1E4EA',
  /** The emails keep a copy (mail-layout.ts): a change is made to both. */
  line: '#EEF0F4',
  text: '#141A24',
  /** The emails keep a copy (mail-layout.ts): a change is made to both. */
  muted: '#5B6575',
  intents: {
    success: '#1E6B3E',
    warning: '#8A5300',
    error: '#B42318',
    info: '#1F5FA8',
  },
  tones: {
    neutral: { bg: '#F0F1F4', fg: '#3A4352', border: '#DCDFE6' },
    info: { bg: '#EAF0FB', fg: '#1B4374', border: '#C9D8F0' },
    positive: { bg: '#E6F4EA', fg: '#1A5632', border: '#BFE0C9' },
    warning: { bg: '#FDF3DC', fg: '#6E4300', border: '#F0D9A3' },
    critical: { bg: '#FDEBE8', fg: '#8A1B12', border: '#F3C6BF' },
  },
};

export const DARK: Scheme = {
  page: '#161A21',
  surface: '#1E232C',
  head: '#232934',
  border: '#2E3440',
  line: '#282E39',
  text: '#E6E9EF',
  /** The emails keep a copy (mail-layout.ts): a change is made to both. */
  muted: '#A3ACBA',
  intents: {
    success: '#7FD1A0',
    warning: '#F2C26B',
    error: '#F4A39A',
    info: '#9CC0F0',
  },
  tones: {
    neutral: { bg: '#2A303A', fg: '#C9D0DC', border: '#3A414D' },
    info: { bg: '#1D2B40', fg: '#A9C6F0', border: '#2C4266' },
    positive: { bg: '#1B3326', fg: '#9AD9B1', border: '#2A4D38' },
    warning: { bg: '#3A2E14', fg: '#F2CF85', border: '#5A4620' },
    critical: { bg: '#3A1F1C', fg: '#F4B4AA', border: '#5A2D28' },
  },
};

/**
 * Five sizes and no others, in px: page title, section, body, small,
 * caption. The theme gives them to h5, h6, body1, body2 and caption.
 */
export const TYPE = {
  title: 25,
  section: 17,
  body: 14.5,
  small: 13,
  caption: 12.5,
} as const;

/**
 * Source Sans 3 for Latin text, hosted by the app; Chinese falls through
 * it, glyph by glyph, to the system's own Chinese font, which costs
 * nothing to load where a Chinese web font would cost megabytes.
 */
export const FONT_STACK = [
  '"Source Sans 3"',
  '"PingFang SC"',
  '"Hiragino Sans GB"',
  '"Microsoft YaHei"',
  '"Noto Sans CJK SC"',
  'system-ui',
  'sans-serif',
].join(', ');

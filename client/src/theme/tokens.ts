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

/** What a rebrand changes. Primary buttons, links, the selected tab. */
export const BRAND = { accent: '#5546B8' } as const;

/** Controls, then panels. Chips are round. */
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

/** How much of the accent dark mode keeps. */
export const DARK_ACCENT_WEIGHT = 0.45;

/** Text on the accent: white on the light accent, near black on the dark. */
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
  border: '#E1E4EA',
  line: '#EEF0F4',
  text: '#141A24',
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

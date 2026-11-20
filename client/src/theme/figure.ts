import { rem } from './rem';
import { TYPE } from './tokens';

/**
 * A figure read across a room, `TYPE.figure` on a 40 px line of the 4 px
 * grid: in rem, so it grows with the text size (ADR-075), its digits one
 * width, so figures side by side line up. Home's tiles, Where it stands'
 * figures and Movements' period (review 51).
 */
export const BIG_FIGURE = {
  fontSize: rem(TYPE.figure),
  lineHeight: 40 / TYPE.figure,
  fontVariantNumeric: 'tabular-nums',
} as const;

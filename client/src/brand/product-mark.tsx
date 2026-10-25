import { SvgIcon } from '@mui/material';

import { rem } from '../theme/rem';
import { MARK } from '../theme/tokens';

const ON_DARK = {
  '& .bowl': { fill: MARK.onDark.bowl },
  '& .stem': { fill: MARK.onDark.stem },
};

/**
 * The product's mark (ADR-082) where the app paints the ground, so it
 * switches with Light and Dark as everything else does: docs/brand's
 * panivo-mark.svg, and panivo-mark-on-dark.svg in Dark. `onDark` for a
 * ground that is dark in both modes, the dark rail's. Hidden from screen
 * readers, as SvgIcon is: the name in text beside it says the same.
 *
 * Its size in px at Standard text, in rem, so it grows with the words
 * beside it (ADR-075).
 */
export function ProductMark({
  size,
  onDark = false,
}: {
  size: number;
  onDark?: boolean;
}) {
  return (
    <SvgIcon
      viewBox="0 0 100 100"
      sx={[
        {
          fontSize: rem(size),
          '& .bowl': { fill: MARK.light.bowl },
          '& .stem': { fill: MARK.light.stem },
        },
        onDark ? ON_DARK : (theme) => theme.applyStyles('dark', ON_DARK),
      ]}
    >
      <g transform="translate(-2 -1)">
        <path className="bowl" d="M24 12H54A26 26 0 0 1 54 64H40Z" />
        <path
          className="stem"
          d="M24 12V76A14 14 0 0 0 52 76A87.142857 87.142857 0 0 0 24 12Z"
        />
      </g>
    </SvgIcon>
  );
}

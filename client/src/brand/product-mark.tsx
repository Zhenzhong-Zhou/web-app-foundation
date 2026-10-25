import { Box, SvgIcon, type SxProps, type Theme } from '@mui/material';

import { useAppName } from '../lib/app-name';
import { rem } from '../theme/rem';
import { MARK, MARK_SHAPE } from '../theme/tokens';

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
      <g transform={MARK_SHAPE.transform}>
        <path className="bowl" d={MARK_SHAPE.bowl} />
        <path className="stem" d={MARK_SHAPE.stem} />
      </g>
    </SvgIcon>
  );
}

/**
 * The mark and the product's name in text beside it, small, inline: the
 * rail's foot and an invitation's footer (ADR-082). Its colour is its
 * place's, unless `sx` gives one.
 */
export function ProductLockup({
  onDark = false,
  sx,
}: {
  onDark?: boolean;
  sx?: SxProps<Theme>;
}) {
  const name = useAppName();
  return (
    <Box
      component="span"
      sx={[
        {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          fontWeight: 600,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <ProductMark size={16} onDark={onDark} />
      {name}
    </Box>
  );
}

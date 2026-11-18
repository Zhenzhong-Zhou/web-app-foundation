import { Box, Tooltip } from '@mui/material';
import { useLayoutEffect, useRef, useState } from 'react';

import { rem } from '../theme/rem';
import { type Placed, placeName } from './stock-places';

/**
 * A place's path on one line, cut from the left where it does not fit, so
 * the place itself stays (57a); the whole path on hover, and on focus,
 * which it takes only while it is cut. In a table it never grows past
 * `maxWidth`; in a card, past the card.
 */
export function PlacePath({
  place,
  maxWidth = { xs: '100%', sm: rem(224), lg: rem(400) },
}: {
  place: Placed;
  maxWidth?: string | Record<string, string>;
}) {
  const text = placeName(place);
  const ref = useRef<HTMLElement>(null);
  const [cut, setCut] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setCut(element.scrollWidth > element.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  return (
    <Tooltip title={cut ? text : ''} placement="top-start">
      <Box
        ref={ref}
        component="span"
        tabIndex={cut ? 0 : undefined}
        sx={{
          display: 'block',
          maxWidth,
          minWidth: 0,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          // Right to left, so the cut and its ellipsis fall on the left;
          // the text inside isolated left to right, so it reads as typed.
          direction: 'rtl',
          textAlign: 'left',
        }}
      >
        <Box component="span" dir="ltr" sx={{ unicodeBidi: 'isolate' }}>
          {text}
        </Box>
      </Box>
    </Tooltip>
  );
}

import { Box, Tooltip } from '@mui/material';
import { useLayoutEffect, useRef, useState } from 'react';

import { nameAndCode } from '../lib/format';
import { HIDDEN } from '../lib/hidden';
import { pathName } from '../products/item-list';
import { type Placed, placeName } from './stock-places';

/**
 * A place's path on one line (57a): whole where it fits; where it does
 * not, cut from the left with "…" at its start, the place's own name and
 * code always whole, "…Zone A › Shelf A2 (A2)". The whole path on hover,
 * and on focus, which it takes only while it is cut; a screen reader
 * reads it whole.
 *
 * It asks its column for the whole path's width and needs none of it (a
 * grid track from 0 to the path's own width), so a table with the room
 * shows it whole, and one without cuts it rather than scrolling. Cut in
 * the code, not by CSS, so the "…" is drawn at the start in every
 * browser.
 */
export function PlacePath({ place }: { place: Placed }) {
  const whole = placeName(place);
  const own = nameAndCode(place.locationName ?? '', place.locationCode);
  const above = pathName(place.locationPath);
  const box = useRef<HTMLElement>(null);
  const ruler = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(whole);

  useLayoutEffect(() => {
    const element = box.current;
    const measure = ruler.current;
    if (!element || !measure) return;
    const widthOf = (text: string) => {
      measure.textContent = text;
      return measure.getBoundingClientRect().width;
    };
    const fit = () => {
      const room = element.getBoundingClientRect().width;
      // No layout (a unit test), nothing above, or it fits: whole.
      if (room === 0 || !above || widthOf(whole) <= room + 0.5) {
        measure.textContent = '';
        setShown(whole);
        return;
      }
      // The longest end of the places above that fits before the place.
      const tail = ` › ${own}`;
      let low = 0;
      let high = above.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        const kept = above.slice(middle).trimStart();
        if (widthOf(`…${kept}${tail}`) <= room + 0.5) high = middle;
        else low = middle + 1;
      }
      setShown(`…${above.slice(low).trimStart()}${tail}`);
      measure.textContent = '';
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [whole, own, above]);

  const cut = shown !== whole;

  return (
    <Box
      data-whole={whole}
      data-least={above ? `… › ${own}` : own}
      sx={{
        // Its track between the least it can show and the whole path:
        // drawn by CSS, so neither is text a reader or a search finds.
        display: 'grid',
        gridTemplateColumns: 'minmax(auto, max-content)',
        position: 'relative',
        // The whole path's width, asked of the column whatever is shown,
        // so a cut never narrows the column it was cut to fit; clipped,
        // so it asks for none of it as its least.
        '&::before': {
          content: 'attr(data-whole)',
          gridArea: '1 / 1',
          height: 0,
          overflow: 'hidden',
          visibility: 'hidden',
          whiteSpace: 'nowrap',
        },
        // The least: "…", and the place's own name whole.
        '&::after': {
          content: 'attr(data-least)',
          gridArea: '1 / 1',
          height: 0,
          visibility: 'hidden',
          whiteSpace: 'nowrap',
        },
      }}
    >
      <Tooltip title={cut ? whole : ''} placement="top-start">
        <Box
          ref={box}
          component="span"
          tabIndex={cut ? 0 : undefined}
          sx={{ gridArea: '1 / 1', overflow: 'hidden', whiteSpace: 'nowrap' }}
        >
          {cut ? (
            <>
              <span aria-hidden="true">{shown}</span>
              <Box component="span" sx={HIDDEN}>
                {whole}
              </Box>
            </>
          ) : (
            whole
          )}
        </Box>
      </Tooltip>
      {/* Measures a candidate in the same type, out of sight and out of
          the layout. */}
      <Box
        ref={ruler}
        component="span"
        aria-hidden="true"
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          visibility: 'hidden',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      />
    </Box>
  );
}

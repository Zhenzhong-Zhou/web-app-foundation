import { Box, Tooltip } from '@mui/material';
import { useLayoutEffect, useRef, useState } from 'react';

import { nameAndCode } from '../lib/format';
import { HIDDEN } from '../lib/hidden';
import { cutsOf, type Placed, placeName } from './stock-places';

/**
 * A place's path on one line (57a): whole where it fits; where it does
 * not, cut in its middle, its warehouse and the place's own name and code
 * always whole, "Main warehouse › … › Shelf A2 (A2)", since the part a
 * cut from the left took away is the one that tells two warehouses apart
 * (ADR-090, amended November 2026; 93a, #639). The whole path on hover,
 * on focus, which it takes only while it is cut, and on a tap; a screen
 * reader reads it whole, and a path shown whole needs no name of its own.
 *
 * It asks its column for the whole path's width and needs none of it but
 * its warehouse, "…" and the place (a grid track from that to the path's
 * own width), so a table with the room shows it whole, and one without
 * cuts it rather than scrolling. Cut in the code, not by CSS, so the "…"
 * stands where the places are left out in every browser. Where even that
 * least is wider than the box it sits in, as one long unbroken name on a
 * phone's card, it wraps, inside a word where it must, rather than
 * widening the card past the screen.
 */
export function PlacePath({ place }: { place: Placed }) {
  const whole = placeName(place);
  const own = nameAndCode(place.locationName ?? '', place.locationCode);
  // Joined, so the effect below runs again only when the path changes.
  const cuts = cutsOf(place.locationPath, own).join('\n');
  const frame = useRef<HTMLElement>(null);
  const box = useRef<HTMLElement>(null);
  const ruler = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(whole);
  const [wraps, setWraps] = useState(false);

  useLayoutEffect(() => {
    const outer = frame.current;
    const element = box.current;
    const measure = ruler.current;
    if (!outer || !element || !measure) return;
    const widthOf = (text: string) => {
      measure.textContent = text;
      return measure.getBoundingClientRect().width;
    };
    const fit = () => {
      const room = element.getBoundingClientRect().width;
      const fits = (text: string) => widthOf(text) <= room + 0.5;
      const candidates = cuts ? cuts.split('\n') : [];
      // No layout (a unit test), nothing to cut, or it fits: whole. Else
      // the longest cut that fits, or the shortest, which the column's
      // least width leaves room for.
      setShown(
        room === 0 || !candidates.length || fits(whole)
          ? whole
          : (candidates.find(fits) ?? candidates[candidates.length - 1]),
      );
      // Even its least wider than the box it sits in, which a table's
      // column never is and a phone's card can be: it wraps.
      setWraps(
        room !== 0 &&
          widthOf(candidates[candidates.length - 1] ?? whole) >
            outer.getBoundingClientRect().width + 0.5,
      );
      measure.textContent = '';
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    // Its own box too: the least holds the path's width while its box
    // narrows past it.
    observer.observe(outer);
    return () => observer.disconnect();
  }, [whole, cuts]);

  const cut = shown !== whole;
  const line = wraps
    ? ({ whiteSpace: 'normal', overflowWrap: 'anywhere' } as const)
    : ({ whiteSpace: 'nowrap' } as const);

  return (
    <Box
      ref={frame}
      data-whole={whole}
      data-least={cuts ? cuts.slice(cuts.lastIndexOf('\n') + 1) : whole}
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
        // The least: the warehouse, "…" and the place, or the whole path
        // with nothing between them to cut; asking for none of it once it
        // wraps.
        '&::after': {
          content: 'attr(data-least)',
          gridArea: '1 / 1',
          height: 0,
          visibility: 'hidden',
          ...line,
        },
      }}
    >
      {/* On a tap too: a tablet has no hover (#639). No title while it is
          whole, so the path has no empty name. */}
      <Tooltip
        title={cut ? whole : null}
        placement="top-start"
        enterTouchDelay={0}
      >
        <Box
          ref={box}
          component="span"
          tabIndex={cut ? 0 : undefined}
          sx={{ gridArea: '1 / 1', overflow: 'hidden', ...line }}
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

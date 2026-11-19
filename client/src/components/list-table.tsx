import { Box, Table, TableContainer, type TableProps } from '@mui/material';
import type { Theme } from '@mui/material/styles';
import {
  type CSSProperties,
  type FocusEventHandler,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useIntl } from 'react-intl';

import {
  BAR_HEIGHT_VAR,
  STUCK_HEADER,
  STUCK_HEADER_VAR,
} from '../layout/use-bar-height';
import { cutEdge } from '../theme/cut-edge';
import { HEADER_STAYS, HEADER_STAYS_QUERY } from '../theme/media';
import { paletteOf } from '../theme/palette-of';
import { SortPressed } from './sort-pressed';

/**
 * What the table's box measures, asked again as the box or the table
 * changes size, never as it scrolls.
 */
interface Shape {
  /** The table as wide as its box, or narrower. */
  fits: boolean;
  /** The tick box's width, where it comes before the name; else null. */
  tick: number | null;
  /** The columns pinned at the start: the name, with a tick box before it. */
  start: number;
  /**
   * The row's actions' width, pinned at the end (E12a): 0 where the list
   * names none, or where they and the start would take more than half the
   * box (guard 1), which leaves the start pinned alone.
   */
  end: number;
  /** The header row's height. */
  head: number;
}

const AT_REST: Shape = { fits: true, tick: null, start: 0, end: 0, head: 0 };

const same = (a: Shape, b: Shape) =>
  a.fits === b.fits &&
  a.tick === b.tick &&
  a.start === b.start &&
  a.end === b.end &&
  a.head === b.head;

/**
 * Whether columns lie under each pinned side, read as the box scrolls:
 * scrolled from the start, or short of the end.
 */
interface Under {
  start: boolean;
  end: boolean;
}

const NOTHING_UNDER: Under = { start: false, end: false };

/**
 * A list page's own table (ADR-090, amended November 2026): a record's
 * lines, a dialog's table and one opened inside a row keep their own
 * `TableContainer`. Named for its table, `label`; its head and body are
 * its children.
 *
 * - **Fitting its box,** the box is no scroll box, so the header row, the
 *   table's own cells and never a copy, stays under the top bar as the
 *   page scrolls: on a window tall enough, by CSS (`HEADER_STAYS`), a
 *   line and a soft shadow under it once it sticks. While it sticks its
 *   height is `--stuck-header` on the root, which the one scroll margin
 *   adds, so a control focused stops below it.
 * - **Too wide for its box,** at any width, the box scrolls sideways and
 *   the header goes with the page: a header kept in step by script would
 *   be a copy (E3). The box takes focus, a region named "{table}, scrolls
 *   sideways", and the name column stays pinned at the start (E10b): the
 *   first column, or the tick box and the name after it. A list's row
 *   actions, its last column marked `ACTIONS_COLUMN`, stay pinned at the
 *   end while the two sides take no more than half the box (E12a). Each
 *   side's edge shows only while columns lie under it, and the box's
 *   scroll padding is the pinned sides' widths, so a control reached by
 *   Tab or Shift+Tab is scrolled wholly clear of them.
 *
 * Whether it fits is measured (a `ResizeObserver` on the box and the
 * table); when the header sticks is CSS media queries (#567), and once
 * it has stuck, two sentinels under an `IntersectionObserver` say. A
 * header that sorts, pressed while it stays, brings the list's first row
 * back under it (E11a; `SortPressed`).
 */
export function ListTable({
  label,
  onFocus,
  children,
  ...table
}: {
  label: string;
  /** On the box, as Stock's and Reorder's `wholeOnFocus`. */
  onFocus?: FocusEventHandler<HTMLDivElement>;
  children: ReactNode;
} & Omit<TableProps, 'aria-label' | 'children'>) {
  const intl = useIntl();
  const box = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const [shape, setShape] = useState(AT_REST);
  const [under, setUnder] = useState(NOTHING_UNDER);
  const [stuck, setStuck] = useState(false);

  // Before the first paint, so a table too wide is drawn so at once.
  useLayoutEffect(() => {
    const frame = box.current;
    const element = tableRef.current;
    if (!frame || !element) return;
    // Columns under each pinned side, read as the box scrolls; the 1 px
    // is a width rounded, as useHeldTotal's is.
    const read = () => {
      const next: Under = {
        start: frame.scrollLeft > 0,
        end: frame.scrollLeft + frame.clientWidth < frame.scrollWidth - 1,
      };
      setUnder((was) =>
        was.start === next.start && was.end === next.end ? was : next,
      );
    };
    const measure = () => {
      const head = element.tHead;
      const cells = head?.rows[0]?.cells;
      const first = cells?.[0];
      const tick = first?.classList.contains('MuiTableCell-paddingCheckbox')
        ? first
        : undefined;
      const name = cells?.[tick ? 1 : 0];
      const last = cells?.[cells.length - 1];
      const width = (cell?: Element) =>
        cell?.getBoundingClientRect().width ?? 0;
      const start = width(tick) + width(name);
      const actions =
        last && last !== name && last.hasAttribute('data-actions')
          ? width(last)
          : 0;
      const next: Shape = {
        // The table's own width, not the box's scroll width: the stuck
        // header's shadow runs 8 px past its last cell, and counted, a
        // table that grew while it stuck, by Show 50 more, stayed too wide.
        fits: element.offsetWidth <= frame.clientWidth + 1,
        // Guard 1 (E12a): the actions pinned while the two sides take no
        // more than half the box, as it is wide now, never as it scrolls.
        end: actions && start + actions <= frame.clientWidth / 2 ? actions : 0,
        tick: tick ? width(tick) : null,
        start,
        head: head?.getBoundingClientRect().height ?? 0,
      };
      setShape((was) => (same(was, next) ? was : next));
      read();
    };
    measure();
    frame.addEventListener('scroll', read, { passive: true });
    // Not in jsdom, as Help's panel finds; measured once there.
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    observer?.observe(frame);
    observer?.observe(element);
    return () => {
      frame.removeEventListener('scroll', read);
      observer?.disconnect();
    };
  }, []);

  // Stuck while the top sentinel has gone above the window and the bottom
  // one, a header's height above the table's foot, has not. Each shows
  // only where the header can stay (HEADER_STAYS), so neither counts on a
  // short window. An observer reports a crossing, not a sentinel shown or
  // hidden, so it is asked again when the window crosses that query.
  useEffect(() => {
    const first = top.current;
    const last = bottom.current;
    if (
      !shape.fits ||
      !first ||
      !last ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return;
    }
    const above = new Map<Element, boolean>();
    let observer: IntersectionObserver | null = null;
    const watch = () => {
      observer?.disconnect();
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          above.set(
            entry.target,
            !entry.isIntersecting &&
              entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0),
          );
        }
        setStuck(!!above.get(first) && !above.get(last));
      });
      observer.observe(first);
      observer.observe(last);
    };
    watch();
    const query = window.matchMedia(HEADER_STAYS_QUERY);
    query.addEventListener('change', watch);
    return () => {
      observer?.disconnect();
      query.removeEventListener('change', watch);
      setStuck(false);
    };
  }, [shape.fits]);

  // One table sticks at a time: they stand one above another on a page.
  useEffect(() => {
    if (!stuck) return;
    const root = document.documentElement.style;
    root.setProperty(STUCK_HEADER, `${shape.head}px`);
    return () => {
      root.removeProperty(STUCK_HEADER);
    };
  }, [stuck, shape.head]);

  // A sort pressed while the header stays brings the list's first row
  // back under it (E11a): the sort starts the list again from its first
  // page, which the page left where it was would scroll past. The header's
  // cells sit below the table's own top only while they stay; the window
  // moves up by that much, so they meet the bar at rest. Focus is not
  // moved: it stays on the header pressed.
  const toFirstRow = useCallback(() => {
    const element = tableRef.current;
    const cell = element?.tHead?.rows[0]?.cells[0];
    if (!element || !cell) return;
    const by =
      element.getBoundingClientRect().top - cell.getBoundingClientRect().top;
    if (by < -1) window.scrollTo({ top: window.scrollY + by });
  }, []);

  const sideways = !shape.fits;
  const end = sideways && shape.end > 0;

  return (
    <TableContainer
      ref={box}
      onFocus={onFocus}
      data-fits={shape.fits || undefined}
      data-stuck={stuck || undefined}
      data-tick={(sideways && shape.tick !== null) || undefined}
      data-end={end || undefined}
      data-under-start={(sideways && under.start) || undefined}
      data-under-end={(end && under.end) || undefined}
      {...(sideways && {
        role: 'region',
        tabIndex: 0,
        'aria-label': intl.formatMessage(
          {
            id: 'components.listTable.scrollsSideways',
            defaultMessage: '{table}, scrolls sideways',
          },
          { table: label },
        ),
      })}
      style={
        {
          '--list-head': `${shape.head}px`,
          '--pin-start': `${shape.tick ?? 0}px`,
          // Guard 2 (E12a): a control focused is scrolled clear of both.
          ...(sideways && {
            scrollPaddingInlineStart: shape.start,
            scrollPaddingInlineEnd: shape.end,
          }),
        } as CSSProperties
      }
      sx={(theme) => frame(theme, sideways, stuck)}
    >
      {shape.fits && <Box ref={top} aria-hidden sx={SENTINEL.top} />}
      <Table ref={tableRef} aria-label={label} {...table}>
        <SortPressed.Provider value={toFirstRow}>
          {children}
        </SortPressed.Provider>
      </Table>
      {shape.fits && <Box ref={bottom} aria-hidden sx={SENTINEL.bottom} />}
    </TableContainer>
  );
}

/**
 * Two 1 px marks inside the box: the top one the top bar's height above
 * the table, gone above the window once the header reaches the bar; the
 * bottom one the bar's and the header's height above the table's foot,
 * gone above the window once the foot pushes the header away.
 */
const SENTINEL = {
  top: {
    position: 'absolute',
    insetInline: 0,
    top: `calc(-1px - ${BAR_HEIGHT_VAR})`,
    height: '1px',
    display: 'none',
    pointerEvents: 'none',
    [HEADER_STAYS]: { display: 'block' },
  },
  bottom: {
    position: 'absolute',
    insetInline: 0,
    bottom: `calc(${BAR_HEIGHT_VAR} + var(--list-head, 0px))`,
    height: '1px',
    display: 'none',
    pointerEvents: 'none',
    [HEADER_STAYS]: { display: 'block' },
  },
} as const;

/** The header row's cells. */
const HEAD = '& > table > thead > tr > th';

/** A row's first or second cell from the start, or its last. */
type Column = 1 | 2 | 'last';

/**
 * A column's cells in the head or the body; a cell spanning more is none,
 * and neither is any cell of a row marked `SPANNING_ROW`. By type, as a
 * row's cells are all of one kind: Emotion warns of `:nth-child` on every
 * render, a server-rendering worry this app has not.
 */
const cells = (part: 'thead' | 'tbody', column: Column) =>
  `& > table > ${part} > tr:not([data-spans]) > :${column === 'last' ? 'last-of-type' : `nth-of-type(${column})`}:not([colspan])`;

/**
 * A column pinned, `at` its inset from the start or the end: the name at
 * the start, the row's actions at the end. The head keeps its own tint; a
 * body cell is the panel's colour, so columns pass beneath it, with the
 * row's own tint (under the pointer, a ticked row's, or an opened row's)
 * laid back over it.
 */
const pinned = (
  theme: Theme,
  column: Column,
  at: { insetInlineStart: string } | { insetInlineEnd: string },
) => {
  const paper = paletteOf(theme).background.paper;
  return {
    [cells('thead', column)]: { position: 'sticky', ...at, zIndex: 1 },
    [cells('tbody', column)]: {
      position: 'sticky',
      ...at,
      zIndex: 1,
      backgroundColor: 'inherit',
      backgroundImage: `linear-gradient(${paper}, ${paper})`,
      '&::after': {
        content: '""',
        position: 'absolute',
        inset: 0,
        zIndex: -1,
        backgroundColor: 'inherit',
        pointerEvents: 'none',
      },
    },
  };
};

/**
 * A pinned column's edge, on its head and body cells, on the side columns
 * pass under: the name's right, the row's actions' left.
 */
const edge = (theme: Theme, column: Column, side: 'left' | 'right') => ({
  [cells('thead', column)]: cutEdge(theme, 'head', side),
  [cells('tbody', column)]: cutEdge(theme, 'paper', side),
});

/**
 * The box's styles. The stuck header's and the pinned columns' are built
 * only while they apply, as an order's held Total is: a component test's
 * default theme has none of the app's surface tokens.
 */
const frame = (theme: Theme, sideways: boolean, stuck: boolean) => {
  const palette = paletteOf(theme);
  return {
    position: 'relative',
    // A number column (NUMBER_COLUMN) as wide as its figures need.
    '& > table > thead > tr > th[data-number]': { width: '1%' },
    '&[data-fits]': {
      overflow: 'visible',
      [HEADER_STAYS]: {
        [HEAD]: {
          position: 'sticky',
          top: BAR_HEIGHT_VAR,
          zIndex: 2,
        },
        ...(stuck && {
          '&[data-stuck]': {
            [HEAD]: {
              // Its own controls give the stuck header's share of the one
              // scroll margin back: they stand above it, under the bar,
              // and a Tab onto one jumped the page to the table's top.
              '& *': {
                scrollMarginTop: `calc(-1 * (${STUCK_HEADER_VAR} + 8px))`,
              },
              boxShadow: `inset 0 -1px 0 ${palette.surface.edge}`,
              // The lift's shadow, cast by a strip along the cell's foot
              // wider than the cell and cut at its sides, so the cells'
              // shadows meet in one and none falls on its neighbour.
              '&::after': {
                content: '""',
                position: 'absolute',
                bottom: 0,
                left: -8,
                right: -8,
                height: 8,
                boxShadow: palette.surface.lift,
                clipPath: 'inset(8px 8px -8px 8px)',
                pointerEvents: 'none',
              },
            },
          },
        }),
      },
    },
    ...(sideways && {
      '&:not([data-fits])': {
        ...pinned(theme, 1, { insetInlineStart: '0px' }),
        '&[data-tick]': pinned(theme, 2, {
          insetInlineStart: 'var(--pin-start)',
        }),
        '&[data-end]': pinned(theme, 'last', { insetInlineEnd: '0px' }),
        '&[data-under-start]:not([data-tick])': edge(theme, 1, 'right'),
        '&[data-under-start][data-tick]': edge(theme, 2, 'right'),
        '&[data-under-end]': edge(theme, 'last', 'left'),
      },
    }),
  } as const;
};

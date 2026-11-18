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

import { cutEdge } from '../theme/cut-edge';
import { HEADER_STAYS, HEADER_STAYS_QUERY } from '../theme/media';
import { SortPressed } from './sort-pressed';

/** The property a stuck header's height is kept in, on the document's root. */
const STUCK_HEADER = '--stuck-header';

/** The palette as CSS variables when the theme has them, else as values. */
const paletteOf = (theme: Theme) =>
  (theme.vars ?? theme).palette as Theme['palette'];

/** What the table's box measures, asked again as either changes size. */
interface Shape {
  /** The table as wide as its box, or narrower. */
  fits: boolean;
  /** Scrolled sideways from its start, so columns pass under the name. */
  scrolled: boolean;
  /** The tick box's width, where it comes before the name; else null. */
  tick: number | null;
  /** The header row's height. */
  head: number;
}

const AT_REST: Shape = { fits: true, scrolled: false, tick: null, head: 0 };

const same = (a: Shape, b: Shape) =>
  a.fits === b.fits &&
  a.scrolled === b.scrolled &&
  a.tick === b.tick &&
  a.head === b.head;

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
 *   sideways", and the name column stays pinned, its edge shown while
 *   columns pass under it (E10b): the first column, or the tick box and
 *   the name after it.
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
  const [stuck, setStuck] = useState(false);

  // Before the first paint, so a table too wide is drawn so at once.
  useLayoutEffect(() => {
    const frame = box.current;
    const element = tableRef.current;
    if (!frame || !element) return;
    const measure = () => {
      const head = element.tHead;
      const first = head?.rows[0]?.cells[0];
      const next: Shape = {
        // The 1 px is a width rounded, as useHeldTotal's is.
        fits: frame.scrollWidth <= frame.clientWidth + 1,
        scrolled: frame.scrollLeft > 0,
        tick: first?.classList.contains('MuiTableCell-paddingCheckbox')
          ? first.getBoundingClientRect().width
          : null,
        head: head?.getBoundingClientRect().height ?? 0,
      };
      setShape((was) => (same(was, next) ? was : next));
    };
    measure();
    frame.addEventListener('scroll', measure, { passive: true });
    // Not in jsdom, as Help's panel finds; measured once there.
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    observer?.observe(frame);
    observer?.observe(element);
    return () => {
      frame.removeEventListener('scroll', measure);
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

  return (
    <TableContainer
      ref={box}
      onFocus={onFocus}
      data-fits={shape.fits || undefined}
      data-stuck={stuck || undefined}
      data-scrolled={(sideways && shape.scrolled) || undefined}
      data-tick={(sideways && shape.tick !== null) || undefined}
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
    top: 'calc(-1px - var(--bar-height, 0px))',
    height: '1px',
    display: 'none',
    pointerEvents: 'none',
    [HEADER_STAYS]: { display: 'block' },
  },
  bottom: {
    position: 'absolute',
    insetInline: 0,
    bottom: 'calc(var(--bar-height, 0px) + var(--list-head, 0px))',
    height: '1px',
    display: 'none',
    pointerEvents: 'none',
    [HEADER_STAYS]: { display: 'block' },
  },
} as const;

/** The header row's cells. */
const HEAD = '& > table > thead > tr > th';

/**
 * A column's cells in the head or the body; a cell spanning more is none.
 * By type, as a row's cells are all of one kind: Emotion warns of
 * `:nth-child` on every render, a server-rendering worry this app has not.
 */
const cells = (part: 'thead' | 'tbody', column: 1 | 2) =>
  `& > table > ${part} > tr > :nth-of-type(${column}):not([colspan])`;

/**
 * The name column pinned, from `left`: the head keeps its own tint; a
 * body cell is the panel's colour, so columns pass beneath it, with the
 * row's own tint (under the pointer, or an opened row's) laid back over
 * it. Its edge shows while columns pass under it.
 */
const pinned = (theme: Theme, column: 1 | 2, left: string) => {
  const paper = paletteOf(theme).background.paper;
  return {
    [cells('thead', column)]: { position: 'sticky', left, zIndex: 1 },
    [cells('tbody', column)]: {
      position: 'sticky',
      left,
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

/** The name column's edge, on its head and body cells. */
const edge = (theme: Theme, column: 1 | 2) => ({
  [cells('thead', column)]: cutEdge(theme, 'head', 'right'),
  [cells('tbody', column)]: cutEdge(theme, 'paper', 'right'),
});

/**
 * The box's styles. The stuck header's and the pinned name's are built
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
          top: 'var(--bar-height, 0px)',
          zIndex: 2,
        },
        ...(stuck && {
          '&[data-stuck]': {
            [HEAD]: {
              // Its own controls give the stuck header's share of the one
              // scroll margin back: they stand above it, under the bar,
              // and a Tab onto one jumped the page to the table's top.
              '& *': {
                scrollMarginTop: 'calc(-1 * (var(--stuck-header, 0px) + 8px))',
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
        ...pinned(theme, 1, '0px'),
        '&[data-tick]': pinned(theme, 2, 'var(--pin-start)'),
        '&[data-scrolled]:not([data-tick])': edge(theme, 1),
        '&[data-scrolled][data-tick]': edge(theme, 2),
      },
    }),
  } as const;
};

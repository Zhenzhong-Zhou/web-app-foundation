import {
  Checkbox,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { themeFor } from '../theme';
import { ACTIONS_COLUMN } from './actions-column';
import { ListTable } from './list-table';
import { NUMBER_COLUMN } from './number-column';
import { SortHeader } from './sort-header';

/** The box as wide as jsdom says, and the table in it this wide. */
function widths(box: number, content: number) {
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(box);
  vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(content);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(
    content,
  );
}

function Stock({
  ticks = false,
  onSort = () => {},
}: {
  ticks?: boolean;
  onSort?: () => void;
}) {
  return (
    <ThemeProvider theme={themeFor('en')}>
      <ListTable label="Stock" size="small">
        <TableHead>
          <TableRow>
            {ticks && (
              <TableCell padding="checkbox">
                <Checkbox
                  slotProps={{ input: { 'aria-label': 'Choose all' } }}
                />
              </TableCell>
            )}
            <TableCell>Item</TableCell>
            <TableCell>Where</TableCell>
            <SortHeader
              number
              label="On hand"
              active={false}
              order="asc"
              onSort={onSort}
            />
            <TableCell {...NUMBER_COLUMN}>Free</TableCell>
            <TableCell {...ACTIONS_COLUMN}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            {ticks && (
              <TableCell padding="checkbox">
                <Checkbox slotProps={{ input: { 'aria-label': 'Choose' } }} />
              </TableCell>
            )}
            <TableCell>Vitamin C 500 mg</TableCell>
            <TableCell>Shelf A2</TableCell>
            <TableCell align="right">48</TableCell>
            <TableCell align="right">40</TableCell>
            <TableCell>
              <button type="button">Actions for Vitamin C 500 mg</button>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell colSpan={ticks ? 6 : 5}>Choose a lot</TableCell>
          </TableRow>
        </TableBody>
      </ListTable>
    </ThemeProvider>
  );
}

const positionOf = (element: Element) => getComputedStyle(element).position;

/** Each cell this wide, as the browser would lay it out. */
function cellWidths(width: number) {
  vi.spyOn(
    HTMLTableCellElement.prototype,
    'getBoundingClientRect',
  ).mockReturnValue({ width, height: 40, top: 0 } as DOMRect);
}

/** The row's actions' cells: the head's and the row's. */
const actionsCells = () => [
  screen.getByRole('columnheader', { name: 'Actions' }),
  screen
    .getByRole('button', { name: 'Actions for Vitamin C 500 mg' })
    .closest('td')!,
];

describe('ListTable (ADR-090, amended November 2026)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('names its table, and fitting its box is no region and no tab stop', () => {
    widths(1000, 1000);
    render(<Stock />);

    const table = screen.getByRole('table', { name: 'Stock' });
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(table.parentElement).not.toHaveAttribute('tabindex');
    expect(positionOf(screen.getByText('Vitamin C 500 mg'))).not.toBe('sticky');
  });

  it('too wide, is a named region with a tab stop, its name pinned', () => {
    widths(800, 1100);
    render(<Stock />);

    const region = screen.getByRole('region', {
      name: 'Stock, scrolls sideways',
    });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toContainElement(
      screen.getByRole('table', { name: 'Stock' }),
    );
    expect(positionOf(screen.getByRole('columnheader', { name: 'Item' }))).toBe(
      'sticky',
    );
    expect(positionOf(screen.getByText('Vitamin C 500 mg'))).toBe('sticky');
    expect(positionOf(screen.getByText('Shelf A2'))).not.toBe('sticky');
    // A cell spanning the row scrolls with it.
    expect(positionOf(screen.getByText('Choose a lot'))).not.toBe('sticky');
  });

  it('too wide, pins the name after a tick box with the box', () => {
    widths(800, 1100);
    render(<Stock ticks />);

    const tickHead = screen.getByRole('checkbox', { name: 'Choose all' });
    expect(positionOf(tickHead.closest('th')!)).toBe('sticky');
    expect(positionOf(screen.getByRole('columnheader', { name: 'Item' }))).toBe(
      'sticky',
    );
    expect(positionOf(screen.getByText('Vitamin C 500 mg'))).toBe('sticky');
    expect(positionOf(screen.getByText('Shelf A2'))).not.toBe('sticky');
  });

  describe('too wide, its row actions pinned at the end (E12a)', () => {
    it('beside the name, while the two take no more than half the box', () => {
      // 150 + 150 of a box 800 wide.
      widths(800, 1100);
      cellWidths(150);
      render(<Stock />);

      const region = screen.getByRole('region');
      for (const cell of actionsCells()) {
        expect(positionOf(cell)).toBe('sticky');
      }
      expect(positionOf(screen.getByText('Vitamin C 500 mg'))).toBe('sticky');
      // Guard 2: a control focused is scrolled clear of both.
      expect(region).toHaveStyle({
        scrollPaddingInlineStart: '150px',
        scrollPaddingInlineEnd: '150px',
      });
    });

    it('past half the box, the name pinned alone', () => {
      // 250 + 250 of a box 800 wide: more than half.
      widths(800, 1100);
      cellWidths(250);
      render(<Stock />);

      const region = screen.getByRole('region');
      for (const cell of actionsCells()) {
        expect(positionOf(cell)).not.toBe('sticky');
      }
      expect(positionOf(screen.getByText('Vitamin C 500 mg'))).toBe('sticky');
      expect(region).toHaveStyle({
        scrollPaddingInlineStart: '250px',
        scrollPaddingInlineEnd: '0px',
      });
    });

    it('shows each side’s edge only while columns lie under it', () => {
      widths(800, 1100);
      cellWidths(150);
      const scrollLeft = vi.spyOn(Element.prototype, 'scrollLeft', 'get');
      render(<Stock />);
      const region = screen.getByRole('region');
      const name = screen.getByText('Vitamin C 500 mg');
      const [head, cell] = actionsCells();
      const edged = (element: Element) =>
        getComputedStyle(element).boxShadow.startsWith('inset');
      const scrollTo = (left: number) => {
        scrollLeft.mockReturnValue(left);
        fireEvent.scroll(region);
      };

      // At its start: columns lie under the actions alone.
      expect(edged(name)).toBe(false);
      expect(edged(head)).toBe(true);
      expect(edged(cell)).toBe(true);

      // Between: under both.
      scrollTo(100);
      expect(edged(name)).toBe(true);
      expect(edged(cell)).toBe(true);

      // At its end, 300 of 1,100 past a box of 800: under the name alone.
      scrollTo(300);
      expect(edged(name)).toBe(true);
      expect(edged(head)).toBe(false);
      expect(edged(cell)).toBe(false);
    });
  });

  it('gives a number column the width its figures need, the text the rest', () => {
    widths(1000, 1000);
    render(<Stock />);

    const widthOf = (name: string) =>
      getComputedStyle(screen.getByRole('columnheader', { name })).width;
    expect(widthOf('On hand')).toBe('1%');
    expect(widthOf('Free')).toBe('1%');
    expect(widthOf('Item')).not.toBe('1%');
    expect(screen.getByRole('columnheader', { name: 'Free' })).toHaveStyle({
      textAlign: 'right',
    });
  });

  describe('a sort pressed from its header (E11a)', () => {
    /** The table's top and its header's, as the window shows them. */
    function tops(table: number, header: number) {
      vi.spyOn(
        HTMLTableElement.prototype,
        'getBoundingClientRect',
      ).mockReturnValue({ top: table } as DOMRect);
      vi.spyOn(
        HTMLTableCellElement.prototype,
        'getBoundingClientRect',
      ).mockReturnValue({ top: header } as DOMRect);
    }

    it('while the header stays, brings the first row under it, focus kept', async () => {
      widths(1000, 1000);
      const onSort = vi.fn();
      render(<Stock onSort={onSort} />);
      // Scrolled 2,000 px down, the table's top 400 px above the window,
      // its header stuck under a 57 px bar.
      vi.stubGlobal('scrollY', 2000);
      tops(-400, 57);
      const scrollTo = vi
        .spyOn(window, 'scrollTo')
        .mockImplementation(() => {});

      const header = screen.getByRole('button', { name: 'On hand' });
      await userEvent.click(header);

      expect(onSort).toHaveBeenCalledOnce();
      expect(scrollTo).toHaveBeenCalledWith({ top: 2000 - 400 - 57 });
      expect(header).toHaveFocus();
    });

    it('with the header at rest, leaves the page where it is', async () => {
      widths(1000, 1000);
      const onSort = vi.fn();
      render(<Stock onSort={onSort} />);
      tops(120, 120);
      const scrollTo = vi
        .spyOn(window, 'scrollTo')
        .mockImplementation(() => {});

      await userEvent.click(screen.getByRole('button', { name: 'On hand' }));

      expect(onSort).toHaveBeenCalledOnce();
      expect(scrollTo).not.toHaveBeenCalled();
    });
  });
});

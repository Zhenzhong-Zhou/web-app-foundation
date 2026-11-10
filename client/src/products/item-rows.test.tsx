import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { ProductSummary } from '../api/types.gen';
import zh from '../locales/zh-Hans.json';
import { themeFor } from '../theme';
import { ItemCards, ItemTable } from './item-rows';

function item(sku: string, variantCount: number): ProductSummary {
  return {
    id: sku,
    type: 'good',
    displayName: sku,
    sku,
    variantCount,
    category: null,
    coverFileId: null,
    isActive: true,
    createdAt: '2026-11-09T12:00:00.000Z',
    updatedAt: '2026-11-09T12:00:00.000Z',
    onHand: '0.0000',
    unitOfMeasure: 'each',
    stockStatus: null,
  };
}

describe('a row’s codes', () => {
  // Chinese has one plural form, `other`, so a row of one variant took the
  // count's words too until `=1` named it (ADR-092's review, 75).
  it('reads the code alone for one variant in Chinese, and the count for more', () => {
    render(
      <IntlProvider locale="zh-Hans" messages={zh} defaultLocale="en">
        <MemoryRouter>
          <ItemCards
            items={[item('FOCUS-60CT', 1), item('CALM-90', 3)]}
            firstNew={null}
          />
        </MemoryRouter>
      </IntlProvider>,
    );

    const [one, three] = screen.getAllByRole('listitem');
    expect(one).toHaveTextContent('FOCUS-60CT · 未分类');
    expect(one).not.toHaveTextContent('个规格');
    expect(three).toHaveTextContent('3 个规格 · CALM-90，…');
  });
});

describe('a card on a phone', () => {
  // Nothing on a phone opened an item's stock (ADR-092's review, 2): the
  // card's stock is a link of its own, beside the item's.
  it('opens Inventory for the item alone from its stock, and the item from the rest', () => {
    render(
      <MemoryRouter>
        <ItemCards
          items={[{ ...item('FOCUS-60CT', 1), stockStatus: 'low' }]}
          firstNew={null}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('link', { name: '0 each, stock of FOCUS-60CT' }),
    ).toHaveAttribute('href', '/inventory?productId=FOCUS-60CT');
    expect(
      screen.getAllByRole('link').map((link) => link.getAttribute('href')),
    ).toEqual(['/items/FOCUS-60CT', '/inventory?productId=FOCUS-60CT']);
  });
});

describe('a row in the table', () => {
  // A link by its colour alone (ADR-092's review, 23; WCAG 1.4.1).
  it('underlines its stock, a link to Inventory for the item', () => {
    // The app's theme, whose links underline on hover unless told.
    render(
      <ThemeProvider theme={themeFor('en')}>
        <MemoryRouter>
          <ItemTable
            items={[item('FOCUS-60CT', 1)]}
            loading={false}
            sort={{ key: 'name', order: 'asc' }}
            header={() => ({
              active: false,
              order: 'asc',
              onSort: () => undefined,
            })}
            onDate={() => undefined}
            firstNew={null}
          />
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(
      screen.getByRole('link', { name: '0 each, stock of FOCUS-60CT' }),
    ).toHaveClass('MuiLink-underlineAlways');
  });
});

import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { ProductSummary } from '../api/types.gen';
import zh from '../locales/zh-Hans.json';
import { ItemCards } from './item-rows';

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
            loading={false}
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

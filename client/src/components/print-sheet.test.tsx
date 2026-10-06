import { render, screen, within } from '@testing-library/react';
import { createIntl } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { DocumentText } from './document-text';
import { PrintLines, PrintSheet } from './print-sheet';

/** A document in English alone, its words from each message's English. */
const english = createIntl({ locale: 'en', messages: {} });
const DOC: DocumentText = {
  locale: 'en',
  languages: ['en'],
  lines: (word) => [word(english)],
  join: (word) => word(english),
  label: (descriptor, values) => english.formatMessage(descriptor, values),
};

describe('PrintSheet', () => {
  it('has a way back and a Print button, both kept off the paper', () => {
    render(
      <MemoryRouter>
        <PrintSheet
          backTo="/orders/order-1"
          backLabel="Back to the order"
          languages={['en']}
        >
          <p>The document</p>
        </PrintSheet>
      </MemoryRouter>,
    );

    const back = screen.getByRole('link', { name: 'Back to the order' });
    expect(back).toHaveAttribute('href', '/orders/order-1');
    // The print CSS hides .no-print; the controls must sit inside it.
    expect(back.closest('.no-print')).not.toBeNull();
    expect(
      screen.getByRole('button', { name: 'Print' }).closest('.no-print'),
    ).not.toBeNull();
    expect(screen.getByText('The document').closest('.no-print')).toBeNull();
  });
});

describe('PrintLines', () => {
  it('prints each line with its own amount, and a dash where there is none', () => {
    render(
      <PrintLines
        doc={DOC}
        currency="CAD"
        lines={[
          {
            id: 'line-1',
            sku: 'EXTRACT',
            description: 'Echinacea extract',
            secondDescription: null,
            quantity: '12.0000',
            unitPrice: '4.5000',
            taxCodeName: 'GST',
            amount: '54.0000',
          },
          {
            id: 'line-2',
            sku: 'CAPS',
            description: 'Capsules',
            secondDescription: null,
            quantity: '1.0000',
            unitPrice: '2.0000',
            taxCodeName: null,
            amount: null,
          },
        ]}
      />,
    );

    const [, first, second] = screen.getAllByRole('row');
    expect(within(first).getByText('EXTRACT')).toBeInTheDocument();
    expect(within(first).getByText('12')).toBeInTheDocument();
    expect(within(first).getByText('GST')).toBeInTheDocument();
    expect(within(first).getByText(/54\.00/)).toBeInTheDocument();

    // No tax code and no amount yet: dashes, not blanks or "null".
    expect(within(second).getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(second).not.toHaveTextContent('null');
  });
});

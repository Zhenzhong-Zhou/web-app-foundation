import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { NUMBERING } from '../test/handlers';
import { server } from '../test/setup';
import { NumberingSection } from './numbering-section';

/**
 * The Numbering section (ADR-073), as approved on the canvas: today is
 * Saturday 17 October 2026, and 452 invoices have been given.
 */
const GIVEN = {
  ...NUMBERING,
  invoice: {
    ...NUMBERING.invoice,
    next: { never: 453, yearly: 1, monthly: 1, daily: 1 },
    last: 'INV-000452',
  },
};

function serve(numbering: unknown = GIVEN) {
  server.use(
    http.get('/api/v1/organization/numbering', () =>
      HttpResponse.json({ numbering }),
    ),
  );
}

const table = () => screen.getByRole('table', { name: 'Numbering' });

describe('NumberingSection', () => {
  it('shows each series as it will print today, and what was given last', async () => {
    serve();
    render(<NumberingSection readOnly={false} />);

    const rows = within(
      await screen.findByRole('table', { name: 'Numbering' }),
    );
    expect(rows.getByText('INV-000453')).toBeInTheDocument();
    expect(rows.getByText('Last: INV-000452')).toBeInTheDocument();
    expect(rows.getByText('PO-000001')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save numbering' }),
    ).toBeDisabled();
  });

  it('says what a reset needs, and adds the date in one tap', async () => {
    serve();
    const user = userEvent.setup();
    render(<NumberingSection readOnly={false} />);
    await screen.findByRole('table', { name: 'Numbering' });

    await user.click(
      within(table()).getByRole('combobox', { name: 'Invoices: Starts again' }),
    );
    await user.click(screen.getByRole('option', { name: 'Each year' }));

    expect(
      screen.getByText(
        'Starting again each year needs the year in the prefix, or the same numbers would come back.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save numbering' }),
    ).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Add the date' }));
    expect(
      screen.getByRole('textbox', { name: 'Invoices: Prefix' }),
    ).toHaveValue('INV-{YYYY}-');
    expect(within(table()).getByText('INV-2026-000001')).toBeInTheDocument();
    expect(
      within(table()).getByText('From Jan 1, 2027: INV-2027-000001'),
    ).toBeInTheDocument();
  });

  it('shows the change before saving it, sending a next number only when typed', async () => {
    serve();
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.put('/api/v1/organization/numbering', async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    render(<NumberingSection readOnly={false} />);
    await screen.findByRole('table', { name: 'Numbering' });

    await user.click(screen.getByRole('textbox', { name: 'Invoices: Prefix' }));
    await user.click(
      screen.getByRole('button', { name: 'INV-2026-0001, each year' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save numbering' }));

    const dialog = within(
      screen.getByRole('dialog', { name: 'Change the numbering?' }),
    );
    expect(dialog.getByText('Invoices')).toBeInTheDocument();
    expect(dialog.getByText('Next: INV-2026-0001')).toBeInTheDocument();
    expect(
      dialog.getByText('The last given stays INV-000452.'),
    ).toBeInTheDocument();

    await user.click(dialog.getByRole('button', { name: 'Change numbering' }));

    expect(sent).toEqual({
      invoice: { prefix: 'INV-{YYYY}-', digits: 4, reset: 'yearly' },
      creditNote: { prefix: 'CN-', digits: 6, reset: 'never' },
      returnAuthorization: { prefix: 'RMA-', digits: 6, reset: 'never' },
      saleOrder: { prefix: 'SO-', digits: 6, reset: 'never' },
      purchaseOrder: { prefix: 'PO-', digits: 6, reset: 'never' },
      documentsInDateOrder: false,
    });
  });

  it('offers the least next number a refusal accepts', async () => {
    serve();
    server.use(
      http.put('/api/v1/organization/numbering', () =>
        HttpResponse.json(
          {
            message:
              'INV-000453 is already an invoice. Under INV-, the next number must be 454 or more.',
            code: 'numbering_number_taken',
            details: { series: ['invoice'], lowest: 454 },
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    render(<NumberingSection readOnly={false} />);
    await screen.findByRole('table', { name: 'Numbering' });

    const next = screen.getByRole('spinbutton', {
      name: 'Invoices: Next number',
    });
    await user.clear(next);
    await user.type(next, '400');
    await user.click(screen.getByRole('button', { name: 'Save numbering' }));
    await user.click(screen.getByRole('button', { name: 'Change numbering' }));

    await user.click(await screen.findByRole('button', { name: 'Use 454' }));
    expect(next).toHaveValue(454);
    expect(await screen.findByText('INV-000454')).toBeInTheDocument();
  });

  it('saves the date-order switch on its own straight away', async () => {
    serve();
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.put('/api/v1/organization/numbering', async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    render(<NumberingSection readOnly={false} />);
    await screen.findByRole('table', { name: 'Numbering' });

    await user.click(
      screen.getByRole('switch', {
        name: /Keep invoices and credit notes in date order/,
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Save numbering' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sent).toMatchObject({ documentsInDateOrder: true });
  });

  it('is read only, with who can change it, for everyone else', async () => {
    serve();
    render(<NumberingSection readOnly />);

    const rows = within(
      await screen.findByRole('table', { name: 'Numbering' }),
    );
    expect(rows.getByText('INV-000453')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save numbering' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('An Owner can change it.')).toBeInTheDocument();
  });
});

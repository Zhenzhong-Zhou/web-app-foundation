import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('says when two series would print the same numbers, on both prefixes', async () => {
    serve();
    const user = userEvent.setup();
    render(<NumberingSection readOnly={false} />);
    await screen.findByRole('table', { name: 'Numbering' });

    const purchase = screen.getByRole('textbox', {
      name: 'Purchase orders: Prefix',
    });
    await user.clear(purchase);
    await user.type(purchase, 'SO-');

    const notice =
      'Sale orders and purchase orders would print the same numbers. Give each its own prefix.';
    expect(screen.getByText(notice)).toBeInTheDocument();
    expect(purchase).toHaveAccessibleDescription(notice);
    expect(
      screen.getByRole('textbox', { name: 'Sale orders: Prefix' }),
    ).toHaveAccessibleDescription(notice);
    expect(
      screen.getByRole('button', { name: 'Save numbering' }),
    ).toBeDisabled();
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
    expect(dialog.getByText(/^Next:/)).toHaveTextContent('Next: INV-2026-0001');
    expect(dialog.getByText(/^The last given stays/)).toHaveTextContent(
      'The last given stays INV-000452.',
    );

    await user.click(dialog.getByRole('button', { name: 'Change numbering' }));

    // Once the save has reached the server (#210).
    await waitFor(() => expect(sent).not.toBeNull());
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

    const use = await screen.findByRole('button', { name: 'Use 454' });
    expect(next).toHaveAccessibleDescription(
      'INV-000453 is already an invoice. Under INV-, the next number must be 454 or more.',
    );
    await user.click(use);
    expect(next).toHaveValue(454);
    expect(await screen.findByText('INV-000454')).toBeInTheDocument();
  });

  it('reads a refusal’s details only beside its code', async () => {
    serve();
    server.use(
      http.put('/api/v1/organization/numbering', () =>
        HttpResponse.json(
          {
            message: 'Something else went wrong.',
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

    expect(
      await screen.findByText('Something else went wrong.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use 454' })).toBeNull();
    expect(next).not.toHaveAccessibleDescription();
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
    await waitFor(() =>
      expect(sent).toMatchObject({ documentsInDateOrder: true }),
    );
  });

  it('says why a digits or next number is refused, and points the field at it', async () => {
    serve();
    const user = userEvent.setup();
    render(<NumberingSection readOnly={false} />);
    await screen.findByRole('table', { name: 'Numbering' });

    const digits = screen.getByRole('spinbutton', { name: 'Invoices: Digits' });
    await user.clear(digits);
    await user.type(digits, '12');
    expect(digits).toHaveAccessibleDescription(
      'Digits: a whole number from 1 to 10.',
    );

    const next = screen.getByRole('spinbutton', {
      name: 'Invoices: Next number',
    });
    await user.clear(next);
    expect(next).toHaveAccessibleDescription(
      'Next number: a whole number, 1 or more.',
    );
    expect(
      screen.getByRole('button', { name: 'Save numbering' }),
    ).toBeDisabled();
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

  describe('on a phone', () => {
    beforeEach(() => {
      // Every width query matches, as at 390 px; jsdom has no matchMedia.
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('max-width'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }));
    });
    afterEach(() => vi.unstubAllGlobals());

    it('labels each field of the row it opens, as the table heads them', async () => {
      serve();
      const user = userEvent.setup();
      render(<NumberingSection readOnly={false} />);

      await user.click(
        await screen.findByRole('button', { name: /^Invoices/ }),
      );

      for (const label of ['Prefix', 'Digits', 'Starts again', 'Next number']) {
        // Each field's own label, as MUI draws it: a <label>, or for the
        // select a div, since a select is not a labelable element.
        expect(
          screen.getByText(label, { selector: '.MuiInputLabel-root' }),
        ).toBeVisible();
      }
      expect(
        screen.getByRole('textbox', { name: 'Invoices: Prefix' }),
      ).toHaveValue('INV-');
    });
  });
});

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { Partner } from '../api/types.gen';
import { server } from '../test/setup';
import { PartnerPicker } from './partner-picker';

function partner(id: string, name: string, code: string | null = null) {
  return {
    id,
    name,
    code,
    taxId: null,
    salePriceListId: null,
    purchasePriceListId: null,
    documentLanguage: null,
    documentSecondLanguage: null,
    notes: null,
    isActive: true,
  } satisfies Partner;
}

const ACME = partner('partner-acme', 'Acme Supplies', 'ACME');
const MINGDE = partner('partner-mingde', '明德药房');
const PARTNERS = [ACME, MINGDE];

function renderPicker({
  none,
  value = '',
  onChange = vi.fn(),
}: { none?: string; value?: string; onChange?: () => void } = {}) {
  render(
    <PartnerPicker
      id="picker"
      label="Partner"
      options={PARTNERS}
      none={none}
      value={value}
      onChange={onChange}
    />,
  );

  return { onChange };
}

/** Each search the picker asks, and the answer `rows` gives it. */
function serve(rows: (search: string) => Promise<Partner[]>) {
  const asked: string[] = [];
  server.use(
    http.get('/api/v1/partners', async ({ request }) => {
      const search = new URL(request.url).searchParams.get('search') ?? '';
      asked.push(search);
      return HttpResponse.json(await rows(search));
    }),
  );
  return asked;
}

const box = () => screen.getByRole('combobox', { name: 'Partner' });
const shown = () =>
  within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .map((option) => option.textContent);

/**
 * Searched on the server (ADR-056, amended), as the item pickers are
 * (usePickerSearch, whose late answer VariantPicker's tests drop): what the
 * form gives until something is typed, then the server's answer, in its
 * order.
 */
describe('PartnerPicker', () => {
  it('lists what it is given before anything is typed, and asks nothing', async () => {
    const user = userEvent.setup();
    const asked = serve(async () => []);
    renderPicker();

    await user.click(box());

    expect(shown()).toEqual(['Acme Supplies (ACME)', '明德药房']);
    expect(asked).toEqual([]);
  });

  // A retired partner the server finds stays out: the form left it out.
  it('asks once typing stops, and lists the answer in its order, within what it was given', async () => {
    const user = userEvent.setup();
    const retired = {
      ...partner('partner-old', 'Mingde Old'),
      isActive: false,
    };
    const asked = serve(async () => [MINGDE, retired, ACME]);
    const { onChange } = renderPicker();

    await user.type(box(), 'mingde');

    expect(
      await screen.findByRole('option', { name: '明德药房' }),
    ).toBeVisible();
    expect(asked).toEqual(['mingde']);
    expect(shown()).toEqual(['明德药房', 'Acme Supplies (ACME)']);

    await user.click(screen.getByRole('option', { name: '明德药房' }));

    expect(onChange).toHaveBeenCalledWith('partner-mingde');
  });

  it('says it is loading while it asks, and that nothing matches only from an answer', async () => {
    const user = userEvent.setup();
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    serve(async () => {
      await answered;
      return [];
    });
    renderPicker();

    await user.type(box(), '药');

    // In the popup's status, which a screen reader hears.
    expect(await screen.findByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByText('No matching partners')).not.toBeInTheDocument();

    answer();

    expect(await screen.findByText('No matching partners')).toBeVisible();
  });

  /**
   * Plan run's "We make it ourselves" (#274): the field's value while no
   * partner is chosen, and a row of its own, first whatever is typed.
   */
  it('names the empty choice in words, as the value and as the first row', async () => {
    const user = userEvent.setup();
    serve(async () => [MINGDE]);
    const { onChange } = renderPicker({
      none: 'We make it ourselves',
      value: 'partner-acme',
    });

    await user.clear(box());
    await user.type(box(), 'mdyf');

    expect(
      await screen.findByRole('option', { name: '明德药房' }),
    ).toBeVisible();
    expect(shown()).toEqual(['We make it ourselves', '明德药房']);

    // Clearing the field reported none already; the row must too.
    vi.mocked(onChange).mockClear();
    await user.click(
      screen.getByRole('option', { name: 'We make it ourselves' }),
    );

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('shows the empty choice as the field’s value, never a blank', () => {
    renderPicker({ none: 'We make it ourselves' });

    expect(box()).toHaveValue('We make it ourselves');
  });
});

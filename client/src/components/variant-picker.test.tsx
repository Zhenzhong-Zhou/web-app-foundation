import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { VariantOption } from '../api/types.gen';
import { VARIANTS } from '../test/handlers';
import { server } from '../test/setup';
import { VariantPicker } from './variant-picker';

const [PLAIN, LOTTED] = VARIANTS as VariantOption[];

function renderPicker({
  options = VARIANTS as VariantOption[],
  loading = false,
  onChange = vi.fn(),
} = {}) {
  render(
    <VariantPicker
      id="picker"
      label="Item"
      options={options}
      loading={loading}
      value=""
      onChange={onChange}
    />,
  );

  return { onChange };
}

/** Each search the picker asks, and the answer `rows` gives it. */
function serve(rows: (search: string) => Promise<VariantOption[]>) {
  const asked: string[] = [];
  server.use(
    http.get('/api/v1/products/variants', async ({ request }) => {
      const search = new URL(request.url).searchParams.get('search') ?? '';
      asked.push(search);
      return HttpResponse.json(await rows(search));
    }),
  );
  return asked;
}

const box = () => screen.getByRole('combobox', { name: 'Item' });
const shown = () =>
  within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .map((option) => option.textContent);

/**
 * Searched on the server (ADR-056, amended): the picker lists what the form
 * gives it until something is typed, then shows what the server finds, in
 * its order, matching nothing itself.
 */
describe('VariantPicker', () => {
  it('lists what it is given before anything is typed, and asks nothing', async () => {
    const user = userEvent.setup();
    const asked = serve(async () => []);
    renderPicker();

    await user.click(box());

    expect(shown()).toEqual([
      'PLAIN-1 — Plain Widget',
      'LOTTED-1 — Tracked Supplement (60ct)',
    ]);
    expect(asked).toEqual([]);
  });

  // A SKU typed whole is first, whatever the label's own order: the server
  // ranks, and the picker keeps what the form left out out.
  it('asks once typing stops, and lists the answer in its order, within what it was given', async () => {
    const user = userEvent.setup();
    const elsewhere = { ...PLAIN, id: 'variant-on-the-order', sku: 'PLAIN-2' };
    const asked = serve(async () => [LOTTED, elsewhere, PLAIN]);
    const { onChange } = renderPicker();

    await user.type(box(), 'zzjn');

    expect(
      await screen.findByRole('option', { name: /LOTTED-1/ }),
    ).toBeVisible();
    expect(asked).toEqual(['zzjn']);
    expect(shown()).toEqual([
      'LOTTED-1 — Tracked Supplement (60ct)',
      'PLAIN-1 — Plain Widget',
    ]);

    await user.click(screen.getByRole('option', { name: /LOTTED-1/ }));

    // An id, so the forms keep submitting the variantId they always did.
    expect(onChange).toHaveBeenCalledWith('variant-lotted');
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

    await user.type(box(), '鱼');

    // In the popup's status, which a screen reader hears.
    expect(await screen.findByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByText('No matching items')).not.toBeInTheDocument();

    answer();

    expect(await screen.findByText('No matching items')).toBeVisible();
    expect(screen.getByRole('status')).not.toHaveTextContent('Loading…');
  });

  it('says it is loading while the catalogue has not come', async () => {
    const user = userEvent.setup();
    renderPicker({ options: [], loading: true });

    await user.click(box());

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByText('No matching items')).not.toBeInTheDocument();
  });

  it('drops an answer that comes after a newer one', async () => {
    const user = userEvent.setup();
    let answerFirst: () => void = () => undefined;
    const firstAnswered = new Promise<void>((resolve) => {
      answerFirst = resolve;
    });
    const asked = serve(async (search) => {
      if (search === 'pl') {
        await firstAnswered;
        return [PLAIN];
      }
      return [LOTTED];
    });
    renderPicker();

    await user.type(box(), 'pl');
    await expect.poll(() => asked).toEqual(['pl']);
    await user.type(box(), 'u');

    expect(
      await screen.findByRole('option', { name: /LOTTED-1/ }),
    ).toBeVisible();
    expect(asked).toEqual(['pl', 'plu']);

    answerFirst();
    // Every chance for the late answer to land before checking it didn't.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(shown()).toEqual(['LOTTED-1 — Tracked Supplement (60ct)']);
  });
});

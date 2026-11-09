import { ThemeProvider } from '@mui/material/styles';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { VariantOption } from '../api/types.gen';
import { VARIANTS } from '../test/handlers';
import { server } from '../test/setup';
import { themeFor } from '../theme';
import { type PickerTask, VariantPicker } from './variant-picker';

const [PLAIN, LOTTED] = VARIANTS as VariantOption[];

function renderPicker({
  options = VARIANTS as VariantOption[],
  loading = false,
  failed = false,
  onChange = vi.fn(),
  task,
}: {
  options?: VariantOption[];
  loading?: boolean;
  failed?: boolean;
  onChange?: (variantId: string) => void;
  task?: PickerTask;
} = {}) {
  // The app's theme, whose renderGroup makes each heading its group's name.
  render(
    <ThemeProvider theme={themeFor('en')}>
      <VariantPicker
        id="picker"
        label="Item"
        options={options}
        loading={loading}
        failed={failed}
        value=""
        onChange={onChange}
        task={task}
      />
    </ThemeProvider>,
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
/** Each option as a screen reader reads it: the item, then its type. */
const shown = () =>
  within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .map((option) =>
      Array.from(option.children, (part) => part.textContent).join(' '),
    );

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
      'PLAIN-1 — Plain Widget Products',
      'LOTTED-1 — Tracked Supplement (60ct) Products',
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
      'LOTTED-1 — Tracked Supplement (60ct) Products',
      'PLAIN-1 — Plain Widget Products',
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

  // A catalogue that failed to load is not one where nothing matches (#303).
  it('says the catalogue could not be loaded when it failed, never that nothing matches', async () => {
    const user = userEvent.setup();
    const asked = serve(async () => []);
    renderPicker({ options: [], failed: true });

    await user.click(box());

    expect(screen.getByText('Could not load the catalogue.')).toBeVisible();
    expect(screen.queryByText('No matching items')).not.toBeInTheDocument();

    // A search's answer cannot offer what was never loaded either.
    await user.type(box(), 'pl');
    await expect.poll(() => asked).toEqual(['pl']);

    expect(
      await screen.findByText('Could not load the catalogue.'),
    ).toBeVisible();
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
    expect(shown()).toEqual(['LOTTED-1 — Tracked Supplement (60ct) Products']);
  });
});

function item(sku: string, productName: string, type: string): VariantOption {
  return {
    id: `variant-${sku}`,
    sku,
    variantName: null,
    productName,
    type,
    unitOfMeasure: 'each',
    tracksLots: false,
  };
}

// The catalogue in the server's order, by code, every type in it.
const BLEND = item('BLEND-1', 'Vitamin C powder', 'material');
const FILLER = item('FILLER-1', 'Capsule filler', 'equipment');
const GLOVES = item('GLOVES-1', 'Nitrile gloves', 'supply');
const LABEL = item('LABEL-1', 'Vitamin C label', 'packaging');
const VITC = item('VITC-100', 'Vitamin C 500 mg', 'good');
const SAMPLE = item('VITC-S10', 'Vitamin C trial pack', 'sample');
const VITD = item('VITD-30', 'Vitamin D3 1000 IU', 'good');
const CATALOGUE = [BLEND, FILLER, GLOVES, LABEL, VITC, SAMPLE, VITD];

/** Each group's heading, as a screen reader names it, and its codes. */
function groups() {
  return within(screen.getByRole('listbox'))
    .getAllByRole('group')
    .map((group) => [
      document.getElementById(group.getAttribute('aria-labelledby') ?? '')
        ?.textContent,
      within(group)
        .getAllByRole('option')
        .map((option) => option.textContent?.split(' — ')[0]),
    ]);
}

/**
 * Pickers put the task's types first (ADR-092): each under its name, then
 * every other item under Other items, still there to choose; a purchase or
 * a receipt by type with none first, since a wholesaler buys products too.
 */
describe('VariantPicker, by type', () => {
  /** The picker for `task`, opened on the whole catalogue: its groups. */
  async function opened(task?: PickerTask) {
    const user = userEvent.setup();
    renderPicker({ options: CATALOGUE, task });
    await user.click(box());
    return groups();
  }

  const BY_EVERY_TYPE = [
    ['Products', ['VITC-100', 'VITD-30']],
    ['Raw materials', ['BLEND-1']],
    ['Packaging', ['LABEL-1']],
    ['Supplies', ['GLOVES-1']],
    ['Samples', ['VITC-S10']],
    ['Equipment', ['FILLER-1']],
  ];

  it('lists a sale’s products and samples first, each under its name, and every other item under Other items', async () => {
    expect(await opened('sale')).toEqual([
      ['Products', ['VITC-100', 'VITD-30']],
      ['Samples', ['VITC-S10']],
      ['Other items', ['BLEND-1', 'FILLER-1', 'GLOVES-1', 'LABEL-1']],
    ]);
  });

  it('lists a recipe’s raw materials and packaging first', async () => {
    expect(await opened('recipe')).toEqual([
      ['Raw materials', ['BLEND-1']],
      ['Packaging', ['LABEL-1']],
      [
        'Other items',
        ['FILLER-1', 'GLOVES-1', 'VITC-100', 'VITC-S10', 'VITD-30'],
      ],
    ]);
  });

  it('lists products first for what a run makes', async () => {
    expect(await opened('run')).toEqual([
      ['Products', ['VITC-100', 'VITD-30']],
      [
        'Other items',
        ['BLEND-1', 'FILLER-1', 'GLOVES-1', 'LABEL-1', 'VITC-S10'],
      ],
    ]);
  });

  it('groups a purchase by every type, none first', async () => {
    expect(await opened('purchase')).toEqual(BY_EVERY_TYPE);
  });

  // A receipt, a reorder point, Movements' filter.
  it('groups by every type, none first, given no task', async () => {
    expect(await opened()).toEqual(BY_EVERY_TYPE);
  });

  // The server's rank within a group, so a code typed whole leads its type.
  it('keeps the server’s order within each group while a search is typed', async () => {
    const user = userEvent.setup();
    serve(async () => [BLEND, VITD, LABEL, VITC]);
    renderPicker({ options: CATALOGUE, task: 'sale' });

    await user.type(box(), 'vit');

    expect(
      await screen.findByRole('option', { name: /VITD-30/ }),
    ).toBeVisible();
    expect(groups()).toEqual([
      ['Products', ['VITD-30', 'VITC-100']],
      ['Other items', ['BLEND-1', 'LABEL-1']],
    ]);
  });

  it('says each item’s type beside it, under Other items too', async () => {
    const user = userEvent.setup();
    renderPicker({ options: CATALOGUE, task: 'sale' });

    await user.click(box());

    expect(
      screen.getByRole('option', {
        name: 'BLEND-1 — Vitamin C powder Raw materials',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('option', {
        name: 'VITC-S10 — Vitamin C trial pack Samples',
      }),
    ).toBeVisible();
  });
});

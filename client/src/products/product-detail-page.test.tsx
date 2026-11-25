import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type {
  CodeStanding,
  ProductCategory,
  ProductDetail,
  UpdateProductDto,
} from '../api/types.gen';
import { ToastProvider } from '../components/toast-provider';
import { apiError } from '../test/handlers';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { ProductDetailPage } from './product-detail-page';

/** As a reader in Chinese gets it: the heading in Chinese, `name` the base. */
const PRODUCT: ProductDetail = {
  id: 'product-1',
  type: 'good',
  name: 'Calm 90ct',
  displayName: '舒缓胶囊 90 粒',
  description: null,
  isActive: true,
  categoryId: null,
  images: [],
  translations: [
    { locale: 'fr-CA', name: 'Calme 90 capsules', description: null },
    { locale: 'zh-Hans', name: '舒缓胶囊 90 粒', description: null },
  ],
  variants: [],
  missingNames: [],
};

function variant(
  id: string,
  sku: string,
  name: string | null,
  translations: { locale: 'en' | 'fr-CA' | 'zh-Hans'; name: string }[],
): ProductDetail['variants'][number] {
  return {
    id,
    sku,
    name,
    unitOfMeasure: 'each',
    isActive: true,
    tracksLots: false,
    weightGrams: null,
    lengthMm: null,
    widthMm: null,
    heightMm: null,
    caseQuantity: null,
    displayName: name ?? sku,
    translations,
  };
}

const TREE: ProductCategory[] = [
  { id: 'bottles', name: 'Bottles', parentId: null, items: [] },
  { id: 'caps', name: 'Bottles and caps', parentId: 'bottles', items: [] },
];

function renderPage(
  product: ProductDetail,
  permissions = ['products.view'],
  required: string[] = [],
  language: string | null = null,
) {
  // The categories first: `:id` would match them too.
  server.use(
    // The languages its documents require, and the one items are named
    // in; the rest of the organization is not read here.
    http.get('/api/v1/organization', () =>
      HttpResponse.json({
        organization: {
          requiredNameLanguages: required,
          productNameLanguage: language,
        },
      }),
    ),
    http.get('/api/v1/products/categories', () =>
      HttpResponse.json({ categories: TREE, uncategorised: [] }),
    ),
    http.get('/api/v1/products/:id', () => HttpResponse.json(product)),
  );
  renderWithAuth(
    <ToastProvider>
      <MemoryRouter initialEntries={['/items/product-1']}>
        <Routes>
          <Route path="/items/:id" element={<ProductDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
    { permissions },
  );
}

describe('ProductDetailPage', () => {
  /**
   * The heading is the reader's language (ADR-056), so the own name, which
   * the edit form fills from and documents print where a language has none,
   * heads the item's row among the names in other languages, labelled the
   * item's own name while the items' language is not set (ADR-054,
   * amended for #531).
   */
  it('names the own name in the item’s row, under a translated heading', async () => {
    renderPage(PRODUCT);

    expect(
      await screen.findByRole('heading', { name: '舒缓胶囊 90 粒' }),
    ).toBeVisible();
    expect(
      screen.getByRole('rowheader', {
        name: /^Item\s*Calm 90ct\s*Item’s own name$/,
      }),
    ).toBeVisible();
    expect(screen.getByRole('cell', { name: '舒缓胶囊 90 粒' })).toBeVisible();
  });

  it('says no base name of its own where it has no other names', async () => {
    renderPage({ ...PRODUCT, displayName: 'Calm 90ct', translations: [] });

    expect(
      await screen.findByRole('heading', { name: 'Calm 90ct' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('table', { name: 'Names in other languages' }),
    ).toBeNull();
  });

  /**
   * One table (ADR-092, #526): the item and each variation with a name of
   * its own, a column for each language, those documents require marked
   * so. A missing required name reads Missing, with Add, and a line at the
   * top names what is missing, as the detail lists it, the server working
   * it out as documents refuse (#551's 65); a variation with no name has
   * no row.
   */
  it('shows the item’s and each named variation’s names by language, a missing required one marked', async () => {
    renderPage(
      {
        ...PRODUCT,
        name: 'Focus',
        displayName: 'Focus',
        translations: [{ locale: 'en', name: 'Focus', description: null }],
        variants: [
          variant('variant-1', 'FOC-30', '30 capsules', [
            { locale: 'en', name: '30 capsules' },
          ]),
          variant('variant-2', 'adasd', '213123', []),
          variant('variant-3', 'FOC-PLAIN', null, []),
        ],
        missingNames: [{ variantId: 'variant-2', sku: 'adasd', locale: 'en' }],
      },
      ['products.view', 'products.update'],
      ['en'],
    );

    const table = await screen.findByRole('table', {
      name: 'Names in other languages',
    });
    // Once the organization's required languages are read.
    expect(
      await within(table).findByRole('columnheader', {
        name: 'English Required on documents',
      }),
    ).toBeVisible();
    expect(
      within(table).getByRole('columnheader', { name: '简体中文' }),
    ).toBeVisible();

    const rows = within(table).getAllByRole('rowheader');
    expect(rows.map((row) => row.textContent)).toEqual([
      'ItemFocusItem’s own name',
      'Variant FOC-3030 capsulesVariant’s own name',
      'Variant adasd213123Variant’s own name',
    ]);
    const adasd = within(table).getByRole('row', { name: /adasd/ });
    expect(within(adasd).getByText('Missing')).toBeVisible();
    expect(
      within(adasd).getByRole('button', {
        name: 'Add the English name of variant adasd',
      }),
    ).toBeVisible();
    expect(
      screen.getByText(/A variant with no name of its own prints the item’s/),
    ).toBeVisible();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A name documents require is missing: the English name of variant adasd. Orders and invoices holding this item cannot print until it is added.',
    );
  });

  /** Add opens Edit names at that row and language, the required marked. */
  it('opens Edit names at the missing name’s row, the required languages marked', async () => {
    const user = userEvent.setup();
    renderPage(
      {
        ...PRODUCT,
        variants: [variant('variant-2', 'adasd', '213123', [])],
        missingNames: [
          { variantId: null, sku: null, locale: 'en' },
          { variantId: 'variant-2', sku: 'adasd', locale: 'en' },
        ],
      },
      ['products.view', 'products.update'],
      ['en'],
    );

    await user.click(
      await screen.findByRole('button', {
        name: 'Add the English name of variant adasd',
      }),
    );

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByRole('textbox', {
        name: 'adasd: 213123, in English',
      }),
    ).toHaveFocus();
    expect(
      within(dialog).getByRole('heading', {
        name: 'English Required on documents',
      }),
    ).toBeVisible();
  });

  /**
   * Once the organization says which language its items are named in, that
   * column comes first and holds each row's own name, with its `lang`,
   * marked as the own one in the muted tone of a label, never Missing,
   * though documents require it: what is missing is the detail's list
   * alone (ADR-054, amended for #531; #551's 65).
   */
  it('holds the own names first, in the column of the language items are named in, never Missing', async () => {
    renderPage(
      {
        ...PRODUCT,
        variants: [variant('variant-1', 'CALM-90', '90ct', [])],
        missingNames: [
          { variantId: null, sku: null, locale: 'en' },
          { variantId: 'variant-1', sku: 'CALM-90', locale: 'en' },
        ],
      },
      ['products.view', 'products.update'],
      ['en', 'zh-Hans'],
      'fr-CA',
    );

    const table = await screen.findByRole('table', {
      name: 'Names in other languages',
    });
    // The first heading names the rows; the items' own language follows.
    await waitFor(() =>
      expect(
        within(table)
          .getAllByRole('columnheader')
          .map((header) => header.textContent),
      ).toEqual([
        'Item or variant',
        'Français (Canada)',
        'EnglishRequired on documents',
        '简体中文Required on documents',
      ]),
    );

    const item = within(table).getByRole('row', { name: /^Item Calm/ });
    const own = within(item).getAllByRole('cell')[0];
    expect(own).toHaveTextContent(/^Calm 90ct\s*Item’s own name$/);
    expect(within(own).getByText('Calm 90ct')).toHaveAttribute('lang', 'fr-CA');
    const named = within(table).getByRole('row', { name: /CALM-90/ });
    expect(within(named).getAllByRole('cell')[0]).toHaveTextContent(
      /^90ct\s*Variant’s own name$/,
    );
    // The kept French name is not shown: the own one is the name there.
    expect(within(table).queryByText('Calme 90 capsules')).toBeNull();

    // English is missing on both rows, as the detail says; 中文 on
    // neither, though it is required and kept on the item only.
    expect(within(item).getAllByText('Missing')).toHaveLength(1);
    expect(within(named).getAllByText('Missing')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(
      '2 names documents require are missing: the English name of the item and the English name of variant CALM-90.',
    );
  });

  /**
   * Edit, Add variant and a variant's Edit say under the name the language
   * items are named in, once it is set, in the reader's words (ADR-054,
   * amended for #531, R6).
   */
  it('says under each name, in Edit and the variant dialogs, the language items are named in', async () => {
    const user = userEvent.setup();
    renderPage(
      { ...PRODUCT, variants: [variant('variant-1', 'CALM-90', '90ct', [])] },
      ['products.view', 'products.update'],
      [],
      'zh-Hans',
    );

    // Once the organization is read: its language's column comes first.
    const table = await screen.findByRole('table', {
      name: 'Names in other languages',
    });
    expect(await within(table).findByText('Item’s own name')).toBeVisible();

    // The page's Edit item, named apart from the variant's (#594).
    await user.click(screen.getByRole('button', { name: 'Edit item' }));
    expect(
      screen.getByRole('textbox', { name: /^Name/ }),
    ).toHaveAccessibleDescription('In Chinese');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByRole('button', { name: 'Add variant' }));
    expect(
      screen.getByRole('textbox', { name: 'Size or variation' }),
    ).toHaveAccessibleDescription('In Chinese · 120ct, Large, Blue');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(
      within(screen.getByRole('table', { name: 'Variants' })).getByRole(
        'button',
        { name: /^Edit variant / },
      ),
    );
    expect(
      screen.getByRole('textbox', { name: 'Size or variation' }),
    ).toHaveAccessibleDescription('In Chinese');
  });

  /** While it is not set, the own name has no language, and nothing says one. */
  it('says no language under the name while none is set', async () => {
    const user = userEvent.setup();
    renderPage(PRODUCT, ['products.view', 'products.update'], ['en']);

    // Once the organization is read: English marked required.
    expect(
      await screen.findByRole('columnheader', {
        name: 'English Required on documents',
      }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Edit item' }));
    expect(
      screen.getByRole('textbox', { name: /^Name/ }),
    ).not.toHaveAccessibleDescription();
  });

  /**
   * Its type, in the singular for the one item (#548), and its category's
   * path under its name (ADR-092).
   */
  it('shows its type and category under its name', async () => {
    renderPage({ ...PRODUCT, type: 'packaging', categoryId: 'caps' });

    expect(
      await screen.findByText('Packaging · Bottles › Bottles and caps'),
    ).toBeVisible();
  });

  it('says Uncategorised under its name when it is in no category', async () => {
    renderPage({ ...PRODUCT, type: 'supply' });

    expect(await screen.findByText('Supply · Uncategorised')).toBeVisible();
  });

  /**
   * Edit changes its name, description, category and type (#306's 30),
   * starting from the base name, and sends only what changed, so History
   * records what the person changed; a new type says where it moves. The
   * types are each one item's, in the singular, and where it moves is the
   * tab's, in the plural (#548).
   */
  it('edits its name, description, category and type, sending only what changed', async () => {
    const sent: UpdateProductDto[] = [];
    server.use(
      http.patch('/api/v1/products/:id', async ({ request }) => {
        sent.push((await request.json()) as UpdateProductDto);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderPage({ ...PRODUCT, type: 'supply' }, [
      'products.view',
      'products.update',
    ]);

    await user.click(await screen.findByRole('button', { name: 'Edit item' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit the item' });
    expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveValue(
      'Calm 90ct',
    );
    expect(
      screen.getByText(
        'It then shows under its new type. Its stock, lots and History stay as they are.',
      ),
    ).toBeVisible();

    expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent(
      /^Supply$/,
    );
    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    // Each type with Add item's line under it (ADR-092's review, 9).
    expect(
      screen.getByRole('option', {
        name: 'Packaging Bottles, boxes and labels',
      }),
    ).toBeVisible();
    await user.click(
      screen.getByRole('option', { name: 'Sample Given away, not sold' }),
    );
    expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent(
      /^Sample$/,
    );
    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    await user.click(
      screen.getByRole('option', { name: 'Bottles › Bottles and caps' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(sent).toEqual([{ type: 'sample', categoryId: 'caps' }]);
    // Where it went, not only "Item saved" (ADR-092's review, 24): the
    // tab's name.
    expect(await screen.findByText('Moved to Samples.')).toBeVisible();
  });
});

// ADR-094, R13 to R15: a code not tracked starts on the item's page.
describe('Start tracking lots', () => {
  const BOTH = ['products.view', 'products.update', 'stock.adjust'];
  const UNTRACKED = {
    ...PRODUCT,
    variants: [variant('variant-1', 'CALM-90', null, [])],
  };
  const QUESTION = {
    variantId: 'variant-1',
    sku: 'CALM-90',
    onHand: '3000.0000',
    places: [
      {
        locationId: 'loc-a',
        locationName: 'Shelf A2',
        locationCode: null,
        locationPath: ['Main warehouse'],
        quantity: '2000.0000',
      },
      {
        locationId: 'loc-b',
        locationName: 'Back room',
        locationCode: null,
        locationPath: [],
        quantity: '1000.0000',
      },
    ],
    runCount: 2,
    runs: [
      { id: 'run-1', reference: 'B-104', makes: true },
      { id: 'run-2', reference: null, makes: false },
    ],
  };

  /** The page, the question and the write answered, what it sent kept. */
  function startable(
    product: ProductDetail = UNTRACKED,
    permissions = BOTH,
    question: Record<string, unknown> = QUESTION,
  ) {
    const sent: Record<string, unknown>[] = [];
    let started = false;
    const path = '/api/v1/products/product-1/variants/variant-1/lot-tracking';
    server.use(
      http.get(path, () => HttpResponse.json(question)),
      http.post(path, async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        started = true;
        return HttpResponse.json(
          { lot: { id: 'lot-1', code: 'L-2026-10-17-1' } },
          { status: 201 },
        );
      }),
    );
    renderPage(product, permissions);
    // Read again once started, the code now tracked.
    server.use(
      http.get('/api/v1/products/:id', () =>
        HttpResponse.json(
          started
            ? {
                ...product,
                variants: product.variants.map((one) => ({
                  ...one,
                  tracksLots: true,
                })),
              }
            : product,
        ),
      ),
    );
    return { user: userEvent.setup(), sent };
  }

  it('offers it for a code not tracked to whoever may change items and correct counts', async () => {
    startable();
    expect(
      await screen.findByRole('button', {
        name: 'Start tracking lots for CALM-90…',
      }),
    ).toHaveTextContent(/^Start tracking lots…$/);
  });

  it('offers it to nobody without both permissions', async () => {
    startable(UNTRACKED, ['products.view', 'products.update']);
    expect(
      await screen.findByRole('button', { name: 'CALM-90' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /^Start tracking lots/ }),
    ).not.toBeInTheDocument();
  });

  it('offers it never for equipment', async () => {
    startable({ ...UNTRACKED, type: 'equipment' });
    expect(
      await screen.findByRole('button', { name: 'CALM-90' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /^Start tracking lots/ }),
    ).not.toBeInTheDocument();
  });

  it('asks with the places and what each holds, the code it will make, the runs that close against it and that it is one way; Cancel changes nothing (R14)', async () => {
    const { user, sent } = startable();
    const button = await screen.findByRole('button', {
      name: 'Start tracking lots for CALM-90…',
    });
    await user.click(button);

    const dialog = await screen.findByRole('dialog', {
      name: 'Start tracking lots for CALM-90',
    });
    expect(
      await within(dialog).findByText(/on hand goes into one lot/),
    ).toHaveTextContent(
      '3,000 each on hand goes into one lot, its code made for us when you start, like L-2026-10-17-1:',
    );
    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      '2,000 each at Main warehouse › Shelf A2',
      '1,000 each at Back room',
    ]);
    // Its cost, as v16's board says it (review 16).
    expect(dialog).toHaveTextContent(
      'Its cost goes with it. What still waits for a cost keeps waiting, on this lot.',
    );
    // And how to split it into real lots later (review 17).
    expect(dialog).toHaveTextContent(
      'Split it into real lots later with Move to another lot…',
    );
    expect(dialog).toHaveTextContent(
      'Runs in progress that use or make it: B-104 and a run with no reference. Each will close against this lot.',
    );
    expect(dialog).toHaveTextContent(
      'This cannot be undone: once started, lot tracking stays on, and each receipt asks for its lot.',
    );
    // In amber, a warning, as the boards draw it (review 18).
    expect(
      within(dialog)
        .getByText(/^This cannot be undone/)
        .closest('.MuiAlert-root'),
    ).toHaveClass('MuiAlert-colorWarning');
    expect(
      within(dialog).getByRole('textbox', { name: /^Supplier’s lot/ }),
    ).toHaveValue('');
    // Expires starts on Not known yet, shown chosen, saying what the lot
    // is then: never an unseen Doesn't expire (S6).
    expect(
      within(dialog).getByRole('radio', { name: 'Not known yet' }),
    ).toBeChecked();
    expect(
      within(dialog).getByRole('radio', { name: 'On a date' }),
    ).not.toBeChecked();
    expect(
      within(dialog).getByRole('radio', { name: 'Doesn’t expire' }),
    ).not.toBeChecked();
    expect(
      within(dialog).getByRole('radiogroup', { name: 'Expires' }),
    ).toHaveAccessibleDescription(
      'Listed on Stock, by lot, under Details to add until someone gives the day or says it doesn’t expire. The stock can still be used.',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(dialog).not.toBeInTheDocument();
    expect(sent).toEqual([]);
  });

  // Review 83: the whole screen on a phone, as #564's dialogs.
  it('fills the screen on a phone', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: /max-width/.test(query),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const { user } = startable();
    await user.click(
      await screen.findByRole('button', {
        name: 'Start tracking lots for CALM-90…',
      }),
    );

    expect(
      await screen.findByRole('dialog', {
        name: 'Start tracking lots for CALM-90',
      }),
    ).toHaveClass('MuiDialog-paperFullScreen');
    vi.unstubAllGlobals();
  });

  // Review 19: v16's Error state, with Try again.
  it('says why its places could not be read, with Try again, which asks again', async () => {
    const { user } = startable();
    let asked = 0;
    server.use(
      http.get(
        '/api/v1/products/product-1/variants/variant-1/lot-tracking',
        () => {
          asked += 1;
          return asked === 1
            ? apiError(503, 'The server is busy. Try again in a moment.')
            : HttpResponse.json(QUESTION);
        },
      ),
    );
    await user.click(
      await screen.findByRole('button', {
        name: 'Start tracking lots for CALM-90…',
      }),
    );
    const dialog = await screen.findByRole('dialog');

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The server is busy. Try again in a moment.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }));

    expect(
      await within(dialog).findByText(/on hand goes into one lot/),
    ).toBeVisible();
    expect(dialog).not.toHaveTextContent('The server is busy.');
  });

  it('says how many runs to a reader who may not see them', async () => {
    const { user } = startable(UNTRACKED, BOTH, { ...QUESTION, runs: null });
    await user.click(
      await screen.findByRole('button', {
        name: 'Start tracking lots for CALM-90…',
      }),
    );

    expect(
      await screen.findByText(
        '2 runs in progress use or make it. Each will close against this lot.',
      ),
    ).toBeVisible();
  });

  it('warns under a day already past that the stock will read as expired, and still starts', async () => {
    const { user, sent } = startable();
    await user.click(
      await screen.findByRole('button', {
        name: 'Start tracking lots for CALM-90…',
      }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(
      await within(dialog).findByRole('radio', { name: 'On a date' }),
    );
    await user.type(
      within(dialog).getByLabelText(/^The day it expires/),
      '2020-01-01',
    );

    expect(dialog).toHaveTextContent(
      'That day has passed: the stock will read as expired, and no longer count as usable.',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Start tracking lots' }),
    );
    await waitFor(() =>
      expect(sent).toEqual([{ expiry: 'date', expiresAt: '2020-01-01' }]),
    );
  });

  it('starts in one write with what is known, its expiry not known yet unless changed, the message naming the lot with Open the lot, the code then reading Tracked (R15, S6)', async () => {
    const { user, sent } = startable();
    await user.click(
      await screen.findByRole('button', {
        name: 'Start tracking lots for CALM-90…',
      }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(
      await within(dialog).findByRole('textbox', { name: /^Supplier’s lot/ }),
      'Sup-77',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Start tracking lots' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Lot tracking started for CALM-90. Its stock on hand is in lot L-2026-10-17-1.',
    );
    expect(screen.getByRole('button', { name: 'Open the lot' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Copy code' }),
    ).not.toBeInTheDocument();
    expect(sent).toEqual([{ supplierLot: 'Sup-77', expiry: 'unknown' }]);
    expect(await screen.findByText('Tracked')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /^Start tracking lots/ }),
    ).not.toBeInTheDocument();
  });

  it('starts a code with nothing on hand, no lot made and nothing asked of one (R13)', async () => {
    const { user, sent } = startable(UNTRACKED, BOTH, {
      ...QUESTION,
      onHand: '0.0000',
      places: [],
      runCount: 0,
      runs: [],
    });
    server.use(
      http.post(
        '/api/v1/products/product-1/variants/variant-1/lot-tracking',
        async ({ request }) => {
          sent.push((await request.json()) as Record<string, unknown>);
          return HttpResponse.json({ lot: null }, { status: 201 });
        },
      ),
    );
    await user.click(
      await screen.findByRole('button', {
        name: 'Start tracking lots for CALM-90…',
      }),
    );
    const dialog = await screen.findByRole('dialog');

    expect(
      await within(dialog).findByText(
        'Nothing is on hand, so no lot is made now.',
      ),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole('textbox', { name: /^Supplier’s lot/ }),
    ).not.toBeInTheDocument();
    await user.click(
      within(dialog).getByRole('button', { name: 'Start tracking lots' }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Lot tracking started for CALM-90. Each receipt now asks for its lot.',
    );
    expect(sent).toEqual([{}]);
  });

  // ADR-094, T3: a second door, under By place and lot, where "Lot: —"
  // raises the question.
  describe('under By place and lot', () => {
    const READS = [
      'stock.view',
      'locations.view',
      'stock.move',
      'stock.reorder',
    ];
    const LINE = /doesn’t track lots, so its stock has no lot numbers\./;

    /** Where it stands for a code, its stock at one place with no lot. */
    function standing(
      variantId: string,
      sku: string,
      onHand = '3000.0000',
    ): CodeStanding {
      const none = '0.0000';
      return {
        variantId,
        sku,
        variantName: null,
        unitOfMeasure: 'each',
        isActive: true,
        onHand,
        usable: onHand,
        notUsable: none,
        expired: none,
        issued: none,
        unavailable: none,
        held: none,
        free: onHand,
        stillNeeded: none,
        short: none,
        coming: none,
        comingOn: null,
        position: onHand,
        expiresFirst: null,
        allExpired: false,
        reorderPoint: null,
        status: null,
        source: null,
        suggestion: null,
        heldOrders: 0,
        holds: [],
        purchases: [],
        runs: [],
        places:
          onHand === none
            ? []
            : [
                {
                  locationId: 'loc-a',
                  locationName: 'Shelf A2',
                  locationCode: null,
                  locationPath: ['Main warehouse'],
                  isAvailable: true,
                  onHand,
                  lots: [
                    {
                      id: `pile-${variantId}`,
                      variantId,
                      sku,
                      productName: 'Calm 90ct',
                      variantName: null,
                      unitOfMeasure: 'each',
                      locationId: 'loc-a',
                      locationName: 'Shelf A2',
                      locationCode: null,
                      lotId: null,
                      lotCode: null,
                      lotExpiresAt: null,
                      lotExpiry: null,
                      lotIsAssigned: null,
                      lotSupplierLot: null,
                      lotFormerCode: null,
                      quantity: onHand,
                      emptiedOn: null,
                      issuedToRun: null,
                    },
                  ],
                },
              ],
        lots: null,
        latestMovements: [],
      };
    }

    /** The item's page with Where it stands answering for its codes. */
    function withStanding(
      codes: CodeStanding[],
      product: ProductDetail = UNTRACKED,
      permissions = [...BOTH, ...READS],
    ) {
      server.use(
        http.get('/api/v1/products/:id/stock', () =>
          HttpResponse.json({ codes }),
        ),
      );
      return startable(product, permissions);
    }

    /** The section Where it stands, once its places are drawn. */
    async function whereItStands() {
      await screen.findAllByRole('heading', { name: 'By place and lot' });
      return screen.getByRole('region', { name: 'Where it stands' });
    }

    it('says a code not tracked has no lot numbers, its last three words the button, naming the code', async () => {
      withStanding([standing('variant-1', 'CALM-90')]);
      const section = await whereItStands();

      const line = within(section).getByText(LINE);
      expect(line).toHaveTextContent(
        /^CALM-90 doesn’t track lots, so its stock has no lot numbers\. Start tracking lots…$/,
      );
      expect(
        within(line).getByRole('button', {
          name: 'Start tracking lots for CALM-90…',
        }),
      ).toHaveTextContent(/^Start tracking lots…$/);
    });

    it('keeps the line where the code holds nothing, since tracking can start with nothing on hand', async () => {
      withStanding([standing('variant-1', 'CALM-90', '0.0000')]);

      expect(
        await screen.findByText(/^None on hand, nothing coming\./),
      ).toBeVisible();
      expect(screen.getByText(LINE)).toHaveTextContent(/^CALM-90 /);
    });

    it.each<[string, Partial<ProductDetail>, string[]]>([
      [
        'a code tracked',
        {
          variants: [{ ...UNTRACKED.variants[0]!, tracksLots: true }],
        },
        [...BOTH, ...READS],
      ],
      ['equipment', { type: 'equipment' }, [...BOTH, ...READS]],
      [
        'a reader who may not correct counts',
        {},
        ['products.view', 'products.update', ...READS],
      ],
      [
        'a reader who may not change items',
        {},
        ['products.view', 'stock.adjust', ...READS],
      ],
    ])('draws no line for %s', async (_, change, permissions) => {
      withStanding(
        [standing('variant-1', 'CALM-90')],
        { ...UNTRACKED, ...change },
        permissions,
      );
      await whereItStands();

      expect(screen.queryByText(LINE)).not.toBeInTheDocument();
    });

    // Where focus returns is the browser's to check: the theme that gives
    // it back is not rendered here (lots-at-receipt.spec.ts).
    it('opens the question for its own code, among several', async () => {
      const product = {
        ...UNTRACKED,
        variants: [
          { ...variant('variant-1', 'CALM-90', '90ct', []), tracksLots: true },
          variant('variant-2', 'CALM-30', '30ct', []),
        ],
      };
      const asked: string[] = [];
      server.use(
        http.get(
          '/api/v1/products/product-1/variants/:variantId/lot-tracking',
          ({ params }) => {
            asked.push(String(params.variantId));
            return HttpResponse.json({
              ...QUESTION,
              variantId: 'variant-2',
              sku: 'CALM-30',
            });
          },
        ),
      );
      const { user } = withStanding(
        [standing('variant-1', 'CALM-90'), standing('variant-2', 'CALM-30')],
        product,
      );
      const section = await whereItStands();

      expect(within(section).getAllByText(LINE)).toHaveLength(1);
      const button = within(section).getByRole('button', {
        name: 'Start tracking lots for CALM-30…',
      });
      await user.click(button);

      const dialog = await screen.findByRole('dialog', {
        name: 'Start tracking lots for CALM-30',
      });
      await within(dialog).findByText(/on hand goes into one lot/);
      expect(asked).toEqual(['variant-2']);
    });
  });
});

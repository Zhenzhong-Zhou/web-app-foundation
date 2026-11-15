import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  ChooseProductNameLanguageDto,
  ProductNameLanguagePreview,
  ProductNameToChoose,
} from '../api/types.gen';
import { ToastProvider } from '../components/toast-provider';
import { server } from '../test/setup';
import { ItemNamesConfirmation } from './item-names-confirmation';

const PREVIEW = '/api/v1/organization/product-name-language';

function preview(
  differing: ProductNameToChoose[] = [],
  counts: Partial<ProductNameLanguagePreview> = {},
): ProductNameLanguagePreview {
  return {
    language: 'zh-Hans',
    items: 214,
    variants: 0,
    copies: 0,
    total: differing.length,
    differing,
    ...counts,
  };
}

const CALM: ProductNameToChoose = {
  kind: 'item',
  id: '00000000-0000-4000-8000-000000000001',
  productId: '00000000-0000-4000-8000-000000000001',
  sku: null,
  ownName: 'Calm 90ct',
  keptName: '安神 90 粒',
  ownDescription: null,
  keptDescription: null,
};

const FOCUS: ProductNameToChoose = {
  kind: 'variant',
  id: '00000000-0000-4000-8000-000000000002',
  productId: '00000000-0000-4000-8000-000000000003',
  sku: 'FOC-30',
  ownName: 'Focus 30',
  keptName: '专注 30',
  ownDescription: null,
  keptDescription: null,
};

const SLEEP: ProductNameToChoose = {
  ...CALM,
  id: '00000000-0000-4000-8000-000000000004',
  productId: '00000000-0000-4000-8000-000000000004',
  ownName: 'Sleep',
  keptName: '睡眠',
  ownDescription: 'For the night',
  keptDescription: '夜用',
};

/** What each choice sent, in order. */
function choicesSent() {
  const sent: ChooseProductNameLanguageDto[] = [];
  server.use(
    http.put(PREVIEW, async ({ request }) => {
      sent.push((await request.json()) as ChooseProductNameLanguageDto);
      return HttpResponse.json({
        copiesRemoved: 180,
        namesRemoved: 1,
        renamed: 1,
      });
    }),
  );
  return sent;
}

function open(props: Partial<Parameters<typeof ItemNamesConfirmation>[0]>) {
  const handlers = {
    onTooMany: vi.fn(),
    onClose: vi.fn(),
    onChosen: vi.fn(),
  };
  render(
    <ToastProvider>
      <ItemNamesConfirmation
        language="zh-Hans"
        from={null}
        {...handlers}
        {...props}
      />
    </ToastProvider>,
  );
  return handlers;
}

/**
 * The confirmation of the items' language (ADR-054, amended for #531), in
 * its six cases: loading, failed, nothing to choose, rows to choose, a
 * list changed meanwhile, and too many (the section's test, at the field).
 */
describe('ItemNamesConfirmation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('opens while it reads what the change will do, its action held', async () => {
    server.use(
      http.get(PREVIEW, async () => {
        await delay('infinite');
        return HttpResponse.json(preview());
      }),
    );
    open({});

    const dialog = await screen.findByRole('dialog', {
      name: 'Name items in Chinese?',
    });
    expect(
      within(dialog).getByRole('button', { name: 'Name items in Chinese' }),
    ).toBeDisabled();
    expect(dialog.querySelector('.MuiSkeleton-root')).not.toBeNull();
  });

  it('says it could not read, with Try again', async () => {
    let reads = 0;
    server.use(
      http.get(PREVIEW, () =>
        ++reads === 1
          ? HttpResponse.json({ message: 'Down' }, { status: 503 })
          : HttpResponse.json(preview()),
      ),
    );
    const user = userEvent.setup();
    open({});

    const dialog = await screen.findByRole('dialog');
    await user.click(
      await within(dialog).findByRole('button', { name: 'Try again' }),
    );

    expect(
      await within(dialog).findByText(/will count as Chinese names/),
    ).toBeInTheDocument();
    expect(reads).toBe(2);
  });

  it('with nothing to choose, says what it does and saves at once', async () => {
    server.use(
      http.get(PREVIEW, ({ request }) => {
        expect(new URL(request.url).searchParams.get('language')).toBe(
          'zh-Hans',
        );
        return HttpResponse.json(preview([], { variants: 3, copies: 180 }));
      }),
    );
    const sent = choicesSent();
    const user = userEvent.setup();
    const { onChosen } = open({ from: 'en' });

    const dialog = await screen.findByRole('dialog', {
      name: 'Name items in Chinese?',
    });
    expect(
      within(dialog).getByText(
        'The own names of 214 items and 3 variants will count as Chinese names, no longer as English names. Nothing is translated.',
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        '180 Chinese names are the same as their own and will be removed as copies.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/can’t be undone/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('table')).not.toBeInTheDocument();

    await user.click(
      within(dialog).getByRole('button', { name: 'Name items in Chinese' }),
    );

    await vi.waitFor(() => expect(onChosen).toHaveBeenCalled());
    expect(sent).toEqual([{ language: 'zh-Hans', choices: [] }]);
    expect(
      await screen.findByText(
        'Items are named in Chinese. 180 copies removed and 1 item renamed.',
      ),
    ).toBeInTheDocument();
  });

  it('refuses at each row left, then saves the names chosen', async () => {
    server.use(
      http.get(PREVIEW, () => HttpResponse.json(preview([CALM, FOCUS, SLEEP]))),
    );
    const sent = choicesSent();
    const user = userEvent.setup();
    const { onChosen } = open({});

    const dialog = await screen.findByRole('dialog');
    const table = await within(dialog).findByRole('table');
    expect(within(dialog).getByText('0 of 3 chosen')).toBeInTheDocument();
    // A row whose description differs shows it on each side.
    expect(within(table).getByText('夜用')).toBeInTheDocument();
    expect(within(table).getByText('For the night')).toBeInTheDocument();

    // Pressed with rows left: nothing sent, each row says so.
    const save = within(dialog).getByRole('button', {
      name: 'Name items in Chinese',
    });
    await user.click(save);
    expect(sent).toEqual([]);
    expect(within(table).getAllByText('Choose one to keep')).toHaveLength(3);
    const calmOwn = within(table).getByRole('radio', { name: 'Calm 90ct' });
    expect(calmOwn).toHaveFocus();
    expect(calmOwn).toHaveAccessibleDescription('Calm 90ct Choose one to keep');
    expect(
      within(dialog).getByText(
        'Choose the name to keep on these 3 rows first:',
      ),
    ).toBeInTheDocument();

    // A column's heading chooses it on every row shown; a row, its own.
    await user.click(
      within(table).getByRole('button', {
        name: 'Chinese name: choose it on every row shown',
      }),
    );
    await user.click(calmOwn);
    expect(within(dialog).getByText('3 of 3 chosen')).toBeInTheDocument();
    expect(
      within(table).queryByText('Choose one to keep'),
    ).not.toBeInTheDocument();

    await user.click(save);

    await vi.waitFor(() => expect(onChosen).toHaveBeenCalled());
    expect(sent).toEqual([
      {
        language: 'zh-Hans',
        choices: [
          { ...strip(CALM), keep: 'own' },
          { ...strip(FOCUS), keep: 'kept' },
          { ...strip(SLEEP), keep: 'kept' },
        ],
      },
    ]);
  });

  it('shows only the rows left, keeping a row chosen in view', async () => {
    server.use(
      http.get(PREVIEW, () => HttpResponse.json(preview([CALM, FOCUS]))),
    );
    const user = userEvent.setup();
    open({});

    const dialog = await screen.findByRole('dialog');
    const table = await within(dialog).findByRole('table');
    await user.click(within(table).getByRole('radio', { name: 'Focus 30' }));
    await user.click(
      within(dialog).getByRole('button', { name: /Only those left/ }),
    );

    expect(within(table).queryByText('Variant FOC-30')).not.toBeInTheDocument();
    const calm = within(table).getByRole('radio', { name: '安神 90 粒' });
    await user.click(calm);
    // Chosen, it stays until the filter is pressed again.
    expect(calm).toBeChecked();
    expect(
      within(
        within(dialog).getByRole('button', { name: /Only those left/ }),
      ).getByText('0'),
    ).toBeInTheDocument();
  });

  it('reads a list changed meanwhile again, keeping each choice whose row stands', async () => {
    const SLEEP_NOW = { ...SLEEP, keptName: '睡眠 新' };
    let reads = 0;
    server.use(
      http.get(PREVIEW, () =>
        HttpResponse.json(
          ++reads === 1
            ? preview([CALM, FOCUS, SLEEP])
            : preview([CALM, SLEEP_NOW]),
        ),
      ),
      http.put(PREVIEW, () =>
        HttpResponse.json(
          {
            message:
              'The names changed since this list was shown, so nothing was saved. Look over the list again, then save.',
            code: 'product_names_changed',
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    open({});

    const dialog = await screen.findByRole('dialog');
    const table = await within(dialog).findByRole('table');
    await user.click(
      within(table).getByRole('button', {
        name: 'Own name: choose it on every row shown',
      }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Name items in Chinese' }),
    );

    const refusal = await within(dialog).findByText(/nothing was saved/);
    expect(refusal.closest('[tabindex="-1"]')).toHaveFocus();
    expect(
      await within(dialog).findByText('No longer on the list: Variant FOC-30.'),
    ).toBeInTheDocument();
    // Calm stands and keeps its choice; Sleep changed, so it is new.
    expect(
      within(table).getByRole('radio', { name: 'Calm 90ct' }),
    ).toBeChecked();
    expect(
      within(table).getByRole('radio', { name: 'Sleep For the night' }),
    ).not.toBeChecked();
    expect(within(table).getAllByText('New')).toHaveLength(1);
    expect(within(dialog).getByText('1 of 2 chosen')).toBeInTheDocument();
    expect(reads).toBe(2);
  });

  it('hands a list too long to choose from to the field, never opening', async () => {
    const many = Array.from({ length: 3 }, (_, index) => ({
      ...CALM,
      id: `00000000-0000-4000-8000-00000000010${index}`,
    }));
    server.use(
      http.get(PREVIEW, () => HttpResponse.json(preview(many, { total: 612 }))),
    );
    const { onTooMany } = open({});

    await vi.waitFor(() => expect(onTooMany).toHaveBeenCalledWith(612, 3));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a card a row on a phone, the two columns’ buttons above', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: /max-width/.test(query),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    server.use(
      http.get(PREVIEW, () => HttpResponse.json(preview([CALM, FOCUS]))),
    );
    const user = userEvent.setup();
    open({});

    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Variant FOC-30');
    expect(within(dialog).queryByRole('table')).not.toBeInTheDocument();
    await user.click(
      within(dialog).getByRole('button', {
        name: 'Own name: choose it on every row shown',
      }),
    );
    expect(within(dialog).getByText('2 of 2 chosen')).toBeInTheDocument();
  });
});

/** A row as the choice sends it back. */
function strip({
  kind,
  id,
  ownName,
  keptName,
  ownDescription,
  keptDescription,
}: ProductNameToChoose) {
  return { kind, id, ownName, keptName, ownDescription, keptDescription };
}

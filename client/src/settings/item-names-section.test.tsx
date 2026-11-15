import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { ProductNameLanguagePreview } from '../api/types.gen';
import { server } from '../test/setup';
import { ItemNamesSection } from './item-names-section';

const PREVIEW = '/api/v1/organization/product-name-language';

function section(props: Partial<Parameters<typeof ItemNamesSection>[0]>) {
  const onSaved = vi.fn(() => Promise.resolve());
  render(
    <ItemNamesSection
      language={null}
      required={[]}
      readOnly={false}
      onSaved={onSaved}
      {...props}
    />,
  );
  return onSaved;
}

/** Each write, in order: its method and what it sent. */
function writesSent() {
  const sent: [string, unknown][] = [];
  server.use(
    http.patch('/api/v1/organization', async ({ request }) => {
      sent.push(['PATCH', await request.json()]);
      return new HttpResponse(null, { status: 204 });
    }),
    http.put(PREVIEW, async ({ request }) => {
      sent.push(['PUT', await request.json()]);
      return HttpResponse.json({
        copiesRemoved: 0,
        namesRemoved: 0,
        renamed: 0,
      });
    }),
  );
  return sent;
}

function previewOf(counts: Partial<ProductNameLanguagePreview>) {
  server.use(
    http.get(PREVIEW, () =>
      HttpResponse.json({
        language: 'zh-Hans',
        items: 3,
        variants: 0,
        copies: 0,
        total: 0,
        differing: [],
        ...counts,
      }),
    ),
  );
}

const field = () =>
  screen.getByRole('combobox', { name: 'Items are named in' });

/**
 * Item names on the Documents tab (ADR-054, amended for #531): the items'
 * language, offered as not set only while it is, and the required
 * languages, the items' own fixed as met by their own names.
 */
describe('ItemNamesSection', () => {
  it('offers not set only while it is not set', async () => {
    const user = userEvent.setup();
    section({ language: null });
    expect(field()).toHaveTextContent('Not set');
    await user.click(field());
    expect(
      screen.getAllByRole('option').map((each) => each.textContent),
    ).toEqual(['Not set', 'English', 'Français (Canada)', '简体中文']);
  });

  it('once set, offers the languages alone', async () => {
    const user = userEvent.setup();
    section({ language: 'en' });
    await user.click(field());
    expect(
      screen.getAllByRole('option').map((each) => each.textContent),
    ).toEqual(['English', 'Français (Canada)', '简体中文']);
  });

  it('shows the items’ own language ticked and fixed, met by each item’s own name', () => {
    section({ language: 'zh-Hans', required: ['en'] });

    const chinese = screen.getByRole('checkbox', { name: /简体中文/ });
    expect(chinese).toBeChecked();
    expect(chinese).toBeDisabled();
    expect(chinese).toHaveAccessibleDescription('Met by each item’s own name');
    expect(screen.getByRole('checkbox', { name: 'English' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'English' })).toBeEnabled();
  });

  it('says to choose the language while a required one is ticked and none is set', async () => {
    const user = userEvent.setup();
    section({ language: null, required: [] });
    const line = /Choose the language items are named in/;
    expect(screen.queryByText(line)).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'English' }));
    expect(
      screen.getByText(line).closest('.MuiAlert-colorInfo'),
    ).not.toBeNull();

    // Choosing the language answers it.
    await user.click(field());
    await user.click(screen.getByRole('option', { name: 'English' }));
    expect(screen.queryByText(line)).not.toBeInTheDocument();
  });

  it('sends the required languages in a fixed order, and only a change', async () => {
    const sent = writesSent();
    const user = userEvent.setup();
    const onSaved = section({ language: 'en', required: [] });

    const save = screen.getByRole('button', { name: 'Save item names' });
    expect(save).toHaveAttribute('aria-disabled', 'true');

    // Ticked back and forth is no change.
    const chinese = screen.getByRole('checkbox', { name: '简体中文' });
    await user.click(chinese);
    await user.click(chinese);
    expect(save).toHaveAttribute('aria-disabled', 'true');

    // Ticked back to front, sent in the catalogue's order.
    await user.click(chinese);
    await user.click(
      screen.getByRole('checkbox', { name: 'Français (Canada)' }),
    );
    await user.click(save);

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(sent).toEqual([
      ['PATCH', { requiredNameLanguages: ['fr-CA', 'zh-Hans'] }],
    ]);
  });

  it('saves the language through the confirmation, then the required languages', async () => {
    previewOf({});
    const sent = writesSent();
    const user = userEvent.setup();
    const onSaved = section({ language: null, required: [] });

    await user.click(field());
    await user.click(screen.getByRole('option', { name: '简体中文' }));
    await user.click(screen.getByRole('checkbox', { name: 'English' }));
    await user.click(screen.getByRole('button', { name: 'Save item names' }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Name items in Chinese?',
    });
    expect(sent).toEqual([]);
    await user.click(
      within(dialog).getByRole('button', { name: 'Name items in Chinese' }),
    );

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(sent).toEqual([
      ['PUT', { language: 'zh-Hans', choices: [] }],
      ['PATCH', { requiredNameLanguages: ['en'] }],
    ]);
  });

  it('refuses at the field more names to choose than can be chosen at once', async () => {
    // The server lists at most 500, with how many there are in all.
    previewOf({
      total: 612,
      differing: Array.from({ length: 500 }, (_, index) => ({
        kind: 'item' as const,
        id: `id-${index}`,
        productId: `id-${index}`,
        sku: null,
        ownName: `Item ${index}`,
        keptName: `物品 ${index}`,
        ownDescription: null,
        keptDescription: null,
      })),
    });
    const sent = writesSent();
    const user = userEvent.setup();
    section({ language: null });

    await user.click(field());
    await user.click(screen.getByRole('option', { name: '简体中文' }));
    await user.click(screen.getByRole('button', { name: 'Save item names' }));

    await vi.waitFor(() => expect(field()).toHaveFocus());
    expect(field()).toHaveAccessibleDescription(
      '612 names kept in Chinese differ from their own, and at most 500 can be chosen at once. Change some in Edit names first, then choose again.',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sent).toEqual([]);
  });

  it('shows the languages to a reader who cannot change them, with no Save', () => {
    section({ language: 'fr-CA', required: ['en'], readOnly: true });

    expect(field()).toHaveTextContent('Français (Canada)');
    expect(screen.getByRole('checkbox', { name: 'English' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Save item names' }),
    ).not.toBeInTheDocument();
  });
});

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { ProductDetail } from '../api/types.gen';
import { server } from '../test/setup';
import { TranslationsDialog } from './translations-dialog';

const PRODUCT: ProductDetail = {
  id: 'product-1',
  type: 'good',
  name: 'Calm',
  displayName: 'Calm',
  description: null,
  isActive: true,
  categoryId: null,
  images: [],
  translations: [],
  variants: [
    {
      id: 'variant-1',
      sku: 'CALM-90',
      name: '90ct',
      unitOfMeasure: 'each',
      isActive: true,
      tracksLots: false,
      weightGrams: null,
      lengthMm: null,
      widthMm: null,
      heightMm: null,
      caseQuantity: null,
      displayName: '90ct',
      translations: [],
    },
  ],
  missingNames: [],
};

describe('TranslationsDialog', () => {
  /**
   * Every language has a name, a description and each named variant's
   * name. A screen reader announces a field by its label, not the heading
   * above it, so each label names its language, and no two are alike
   * (#315): in the reader's language, as the server's refusal does, the
   * heading keeping its own name (ADR-054's November 2026 amendment).
   */
  it('names each field’s language in its label', () => {
    render(
      <TranslationsDialog
        open
        product={PRODUCT}
        onClose={() => undefined}
        onSaved={async () => undefined}
      />,
    );

    for (const language of ['English', 'French', 'Chinese']) {
      expect(
        screen.getByRole('textbox', { name: `Name in ${language}` }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('textbox', { name: `Description in ${language}` }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('textbox', { name: `CALM-90: 90ct, in ${language}` }),
      ).toBeInTheDocument();
    }
    expect(screen.getAllByRole('textbox')).toHaveLength(9);
  });

  /**
   * The languages the organization's documents require are marked, and the
   * intro says a blank prints the base name only of the others, which a
   * required language does not (ADR-092, #306's 18).
   */
  it('marks the required languages, saying a blank prints the base name only of the others', () => {
    render(
      <TranslationsDialog
        open
        product={PRODUCT}
        required={['en']}
        onClose={() => undefined}
        onSaved={async () => undefined}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'English Required on documents' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Français (Canada)' }),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Documents require names in English: while one is blank, orders and invoices holding this item cannot print.',
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Where another language is left blank, documents in it print the base name, Calm.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Where a language is left blank/)).toBeNull();
  });

  /**
   * In the language items are named in, the own name is the name, and the
   * server keeps none beside it: no field asks for one, and a line says
   * the own name is the name there, changed with Edit. The intro names
   * only the other required languages, since that one is met (ADR-054,
   * amended for #531, R5).
   */
  it('asks for no name in the language items are named in, saying the own name is its name there', () => {
    render(
      <TranslationsDialog
        open
        product={PRODUCT}
        required={['en', 'zh-Hans']}
        language="zh-Hans"
        onClose={() => undefined}
        onSaved={async () => undefined}
      />,
    );

    expect(screen.queryByRole('textbox', { name: /in Chinese$/ })).toBeNull();
    expect(screen.getAllByRole('textbox')).toHaveLength(6);
    expect(screen.getByRole('heading', { name: '简体中文' })).toBeVisible();
    // In the info tone, the own name in its language.
    const line = screen.getByRole('alert');
    expect(line).toHaveTextContent(
      'Items are named in Chinese, so this item’s own name, Calm, is its Chinese name. Change it with Edit.',
    );
    expect(line).toHaveClass('MuiAlert-colorInfo');
    expect(within(line).getByText('Calm')).toHaveAttribute('lang', 'zh-Hans');
    expect(
      screen.getByText(
        'Documents require names in English: while one is blank, orders and invoices holding this item cannot print.',
      ),
    ).toBeVisible();
  });

  /**
   * A description is what a name in its language says more about: one with
   * no name in that language is refused before saving, naming the
   * language, and nothing is sent (#306's 12).
   */
  it('refuses a description in a language with no name in it, sending nothing', async () => {
    let sent = false;
    server.use(
      http.put('/api/v1/products/:id/translations', () => {
        sent = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    render(
      <TranslationsDialog
        open
        product={PRODUCT}
        onClose={() => undefined}
        onSaved={async () => undefined}
      />,
    );

    await user.type(
      screen.getByRole('textbox', { name: 'Description in French' }),
      'Pour dormir',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'A description in French needs a name in French too.',
      ),
    ).toBeVisible();
    expect(sent).toBe(false);
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ProductDetail } from '../api/types.gen';
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
};

describe('TranslationsDialog', () => {
  /**
   * Every language has a name, a description and each named variant's
   * name. A screen reader announces a field by its label, not the heading
   * above it, so each label names its language, and no two are alike
   * (#315).
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

    for (const language of ['English', 'Français (Canada)', '简体中文']) {
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
});

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
});

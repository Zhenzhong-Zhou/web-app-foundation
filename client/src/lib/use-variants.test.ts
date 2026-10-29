import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

import type { VariantOption } from '../api/types.gen';
import { useLanguage } from '../i18n/use-language';
import { server } from '../test/setup';
import { useVariants } from './use-variants';

function option(productName: string): VariantOption {
  return {
    id: 'variant-1',
    sku: 'FOCUS-60CT',
    productName,
    variantName: null,
    type: 'good',
    unitOfMeasure: 'each',
    tracksLots: false,
  };
}

describe('useVariants', () => {
  afterEach(() => localStorage.clear());

  /** The catalogue is named in the reader's language (ADR-056, amended). */
  it('reads the catalogue again when the language changes (#297)', async () => {
    const asked: (string | null)[] = [];
    server.use(
      http.get('/api/v1/products/variants', ({ request }) => {
        const language = request.headers.get('accept-language');
        asked.push(language);
        return HttpResponse.json([
          option(language === 'zh-Hans' ? '专注胶囊 60 粒' : 'Focus 60ct'),
        ]);
      }),
    );

    const { result } = renderHook(() => ({
      catalogue: useVariants(true),
      language: useLanguage(),
    }));
    await waitFor(() =>
      expect(result.current.catalogue.variants[0]?.productName).toBe(
        'Focus 60ct',
      ),
    );

    await act(() => result.current.language.setLocale('zh-Hans'));

    await waitFor(() =>
      expect(result.current.catalogue.variants[0]?.productName).toBe(
        '专注胶囊 60 粒',
      ),
    );
    expect(asked).toEqual(['en', 'zh-Hans']);
  });
});

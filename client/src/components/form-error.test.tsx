import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FormError } from './form-error';

// orders.lotCodeSkuNever, as the server words it, with the demo's codes.
const REFUSAL =
  'Lot FOC-2609-01 of BLEND-FOCUS never shipped on this order, so it cannot come back against it';

describe('FormError', () => {
  it('keeps a reference in the server’s refusal whole, its words read whole (ADR-081)', () => {
    render(
      <>
        <FormError id="refusal" message={REFUSAL} />
        <input aria-label="Quantity" aria-describedby="refusal" />
      </>,
    );

    for (const code of ['FOC-2609-01', 'BLEND-FOCUS']) {
      expect(getComputedStyle(screen.getByText(code)).whiteSpace).toBe(
        'nowrap',
      );
    }
    // The field it describes still reads the refusal as one sentence.
    expect(
      screen.getByRole('textbox', { name: 'Quantity' }),
    ).toHaveAccessibleDescription(REFUSAL);
    expect(screen.getByRole('alert', { name: 'Error' })).toHaveTextContent(
      REFUSAL,
    );
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VARIANTS } from '../test/handlers';
import { VariantPicker } from './variant-picker';

function renderPicker(onChange = vi.fn()) {
  render(
    <VariantPicker
      id="picker"
      label="Item"
      options={VARIANTS}
      value=""
      onChange={onChange}
    />,
  );

  return { onChange };
}

describe('VariantPicker', () => {
  // The reason it is not a select: at fifty options, typing is the only
  // usable way in, and people type whichever half they remember.
  it('finds an item by product name as well as SKU', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();

    await user.type(screen.getByRole('combobox', { name: 'Item' }), 'suppl');

    expect(
      screen.queryByRole('option', { name: /PLAIN-1/ }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('option', {
        name: 'LOTTED-1 — Tracked Supplement (60ct)',
      }),
    );

    // An id, so the forms keep submitting the variantId they always did.
    expect(onChange).toHaveBeenCalledWith('variant-lotted');
  });
});

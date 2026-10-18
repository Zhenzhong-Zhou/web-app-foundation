import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { renderWithAuth } from '../test/render-with-auth';
import { setTextSize } from '../theme/text-size';
import { TextSizeSelect } from './text-size-select';

/**
 * The picker changes the screens at once and this device keeps the choice
 * (ADR-075).
 */
describe('TextSizeSelect', () => {
  afterEach(() => {
    setTextSize('standard');
    localStorage.clear();
  });

  it('offers three sizes, Standard until one is chosen', async () => {
    renderWithAuth(<TextSizeSelect />);

    const select = screen.getByRole('combobox', { name: 'Text size' });
    expect(select).toHaveTextContent('Standard text');

    await userEvent.click(select);

    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['Standard text', 'Large text', 'Larger text']);
  });

  it('switches the screens and remembers the choice', async () => {
    renderWithAuth(<TextSizeSelect />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Text size' }));
    await userEvent.click(screen.getByRole('option', { name: 'Larger text' }));

    expect(document.documentElement.style.fontSize).toBe('125%');
    expect(localStorage.getItem('textSize')).toBe('larger');
    expect(
      screen.getByRole('combobox', { name: 'Text size' }),
    ).toHaveTextContent('Larger text');
  });
});

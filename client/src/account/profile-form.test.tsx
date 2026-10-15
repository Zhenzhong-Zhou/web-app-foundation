import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithAuth } from '../test/render-with-auth';
import { ProfileForm } from './profile-form';

/**
 * The Account page's language line (#119): said only while the account
 * has none chosen, as the picker's description.
 */
describe('ProfileForm', () => {
  it('says what no language chosen means, under the picker', () => {
    renderWithAuth(<ProfileForm />, { user: { locale: null } });

    const picker = screen.getByRole('combobox', { name: 'Language' });
    expect(picker).toHaveTextContent('Not chosen');
    expect(picker).toHaveAccessibleDescription(
      /^Not chosen yet: the screens follow this device/,
    );
  });

  it('says nothing more once the account has one', () => {
    renderWithAuth(<ProfileForm />, { user: { locale: 'en' } });

    const picker = screen.getByRole('combobox', { name: 'Language' });
    expect(picker).toHaveTextContent('English');
    expect(picker).not.toHaveAccessibleDescription();
    expect(screen.queryByText(/Not chosen yet/)).not.toBeInTheDocument();
  });
});

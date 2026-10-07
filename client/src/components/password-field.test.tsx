import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { TestProviders } from '../test/test-providers';
import { PasswordField } from './password-field';

describe('PasswordField', () => {
  it('starts hidden, shows on request, and hides again', async () => {
    const user = userEvent.setup();
    render(<PasswordField id="pw" label="Password" />, {
      wrapper: TestProviders,
    });

    const field = screen.getByLabelText('Password', { selector: 'input' });
    expect(field).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(field).toHaveAttribute('type', 'password');
  });

  it('toggles each field on its own', async () => {
    const user = userEvent.setup();
    render(
      <>
        <PasswordField id="current" label="Current password" />
        <PasswordField id="new" label="New password" />
      </>,
      { wrapper: TestProviders },
    );

    const [showCurrent] = screen.getAllByRole('button', {
      name: 'Show password',
    });
    await user.click(showCurrent);

    expect(
      screen.getByLabelText('Current password', { selector: 'input' }),
    ).toHaveAttribute('type', 'text');
    expect(
      screen.getByLabelText('New password', { selector: 'input' }),
    ).toHaveAttribute('type', 'password');
  });
});

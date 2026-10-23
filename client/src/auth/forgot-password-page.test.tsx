import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { server } from '../test/setup';
import { deploy, OUTDATED, outdatedRefusal } from '../test/version';
import { AuthContext } from './auth-context';
import { ForgotPasswordPage } from './forgot-password-page';

async function ask() {
  const user = userEvent.setup();
  // Signed out, as the page is reached.
  render(
    <AuthContext.Provider
      value={{
        session: null,
        loading: false,
        error: null,
        refresh: () => Promise.resolve(),
        signedOut: () => undefined,
      }}
    >
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Email' }),
    'mei@example.com',
  );
  await user.click(screen.getByRole('button', { name: /send/i }));
}

/**
 * Its own fixed words, since the server's must never be repeated here
 * (ADR-017); a refusal for this tab's API revision says what to do in its
 * own, never that the server is out of reach (ADR-081).
 */
describe('ForgotPasswordPage, failing', () => {
  it('says the server is out of reach when nothing answers', async () => {
    server.use(
      http.post('/api/v1/auth/forgot-password', () => HttpResponse.error()),
    );
    await ask();

    expect(
      await screen.findByText('Could not reach the server.'),
    ).toBeVisible();
  });

  it('says a new version is being installed, then, once it is out, to reload', async () => {
    server.use(
      http.post('/api/v1/auth/forgot-password', () => outdatedRefusal()),
    );
    await ask();

    expect(
      await screen.findByText(
        'A new version is being installed. Try again in a minute; nothing was saved.',
      ),
    ).toBeVisible();
    expect(screen.queryByText('Could not reach the server.')).toBeNull();

    await deploy({ urgent: true });
    expect(screen.getByText(OUTDATED)).toBeVisible();
  });
});

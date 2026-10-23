import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { ForgottenPasswordHint } from './forgotten-password-hint';

/**
 * The way on from a refused password (#120): one press emails a reset
 * link to the person's own address, and says so.
 */
describe('ForgottenPasswordHint', () => {
  it('emails a reset link to the person’s own address, and says so', async () => {
    const sent: unknown[] = [];
    server.use(
      http.post('/api/v1/auth/forgot-password', async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ sent: true }, { status: 202 });
      }),
    );
    renderWithAuth(<ForgottenPasswordHint />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Email me a reset link' }),
    );

    // Said, and given the focus the link had, which is gone: in an effect
    // once the line is drawn (#210).
    const said = await screen.findByText(
      'A reset link is on its way to owner@alpha.example.com.',
    );
    await waitFor(() => expect(said).toHaveFocus());
    expect(sent).toEqual([{ email: 'owner@alpha.example.com' }]);
  });

  it('says when it was asked too often, and can be pressed again', async () => {
    server.use(
      http.post('/api/v1/auth/forgot-password', () =>
        HttpResponse.json(
          { statusCode: 429, message: 'ThrottlerException' },
          { status: 429 },
        ),
      ),
    );
    renderWithAuth(<ForgottenPasswordHint />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Email me a reset link' }),
    );

    expect(
      await screen.findByText(/Too many requests\. Try again later\./),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Email me a reset link' }),
    ).toBeEnabled();
  });
});

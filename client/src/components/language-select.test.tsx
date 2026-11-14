import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { LanguageSelect } from './language-select';

/**
 * The picker switches the screens at once, in the step that loads the
 * language, and saves the choice to the account (ADR-054).
 */
describe('LanguageSelect', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('offers each language in its own name, and en-XA in development and tests', async () => {
    renderWithAuth(<LanguageSelect />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Language' }));

    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual([
      'English',
      'Français (Canada) — bêta',
      '简体中文（测试版）',
      'en-XA',
    ]);
    expect(
      screen.getByRole('option', { name: '简体中文（测试版）' }),
    ).toHaveAttribute('lang', 'zh-Hans');
  });

  it('switches the screens, the page language and the account', async () => {
    let saved: unknown = null;
    server.use(
      http.patch('/api/v1/account/profile', async ({ request }) => {
        saved = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithAuth(<LanguageSelect />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Language' }));
    await userEvent.click(
      screen.getByRole('option', { name: 'Français (Canada) — bêta' }),
    );

    // Its own label is now French: the catalogue loaded and took over.
    expect(
      await screen.findByRole('combobox', { name: 'Langue' }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fr-CA');
    expect(localStorage.getItem('language')).toBe('fr-CA');
    await waitFor(() => expect(saved).toEqual({ locale: 'fr-CA' }));
  });

  it('switches the screens to en-XA, and saves the account as English', async () => {
    let saved: unknown = null;
    server.use(
      http.patch('/api/v1/account/profile', async ({ request }) => {
        saved = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithAuth(<LanguageSelect />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Language' }));
    await userEvent.click(screen.getByRole('option', { name: 'en-XA' }));

    expect(
      await screen.findByRole('combobox', { name: '[Ĺáñğúáğé one]' }),
    ).toHaveTextContent('en-XA');
    expect(localStorage.getItem('language')).toBe('en-XA');
    // The account knows no en-XA: to the server it is English.
    await waitFor(() => expect(saved).toEqual({ locale: 'en' }));
  });

  it('on the Account page, says none is chosen and saves the one on screen (#119)', async () => {
    let saved: unknown = null;
    server.use(
      http.patch('/api/v1/account/profile', async ({ request }) => {
        saved = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const refresh = vi.fn(() => Promise.resolve());

    renderWithAuth(
      <>
        <LanguageSelect account describedBy="language-hint" />
        <p id="language-hint">Emails follow it once chosen.</p>
      </>,
      { user: { locale: null }, refresh },
    );

    const picker = screen.getByRole('combobox', { name: 'Language' });
    expect(picker).toHaveTextContent('Not chosen');
    expect(picker).toHaveAccessibleDescription('Emails follow it once chosen.');

    // English is already on screen; choosing it must still save it.
    await userEvent.click(picker);
    await userEvent.click(screen.getByRole('option', { name: 'English' }));

    await waitFor(() => expect(saved).toEqual({ locale: 'en' }));
    // Read back, so the picker shows what the account now holds.
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

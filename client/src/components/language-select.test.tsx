import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

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

  it('offers each language in its own name', async () => {
    renderWithAuth(<LanguageSelect />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Language' }));

    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['English', 'Français (Canada) — bêta', '简体中文（测试版）']);
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
});

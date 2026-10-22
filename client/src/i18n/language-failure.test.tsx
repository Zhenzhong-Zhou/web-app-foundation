import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_REVISION } from '../api/revision.gen';
import { LanguageSelect } from '../components/language-select';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { BUILD } from '../version/build';
import { ChunkLoadError, loadChunkOrReload } from '../version/load-chunk';
import { reloadPage } from '../version/reload-page';
import { checkVersion } from '../version/version-check';
import { loadMessages } from './catalogues';
import {
  LanguageFailureBanner,
  LanguageFailureToast,
} from './language-failure';
import { useLanguage } from './use-language';

/** The next catalogue's chunk will not load: the connection dropped. */
function failNextLoad() {
  vi.mocked(loadMessages).mockRejectedValueOnce(
    new ChunkLoadError(
      'offline',
      new TypeError('Failed to fetch dynamically imported module'),
    ),
  );
}

/** The account's choice, as AuthProvider applies it once the session says. */
function AccountLanguage() {
  const { setLocale } = useLanguage();
  useEffect(() => {
    void setLocale('zh-Hans');
  }, [setLocale]);
  return null;
}

/** The account's language, saved by the picker once it has loaded. */
function watchSaves() {
  const saved = vi.fn();
  server.use(
    http.patch('/api/v1/account/profile', async ({ request }) => {
      saved(await request.json());
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return saved;
}

/** A language that won’t load says so, and saves nothing (ADR-081). */
describe('a language that won’t load', () => {
  beforeEach(async () => {
    vi.mocked(loadMessages).mockClear();
    vi.mocked(reloadPage).mockClear();
    sessionStorage.clear();
    // This tab's own build on the server, whatever the test before it read.
    await checkVersion();
  });
  afterEach(() => {
    localStorage.clear();
  });

  describe('switching', () => {
    // Moving on its own as well, as user-event's own waits need.
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
    afterEach(() => vi.useRealTimers());

    it('stays in the language it was in, says so until closed, and saves once Try again loads it', async () => {
      const user = userEvent.setup({
        advanceTimers: (ms) => vi.advanceTimersByTime(ms),
      });
      const saved = watchSaves();
      failNextLoad();
      renderWithAuth(
        <>
          <LanguageSelect />
          <LanguageFailureToast />
        </>,
      );

      await user.click(screen.getByRole('combobox', { name: 'Language' }));
      await user.click(
        screen.getByRole('option', { name: '简体中文（测试版）' }),
      );

      const toast = await screen.findByRole('status');
      expect(toast).toHaveTextContent(
        'Couldn’t load 简体中文. Check your connection and try again.',
      );
      expect(within(toast).getByText('简体中文')).toHaveAttribute(
        'lang',
        'zh-Hans',
      );
      // Still in English, and nothing saved, on this device or the account.
      expect(
        screen.getByRole('combobox', { name: 'Language' }),
      ).toHaveTextContent('English');
      expect(localStorage.getItem('language')).toBeNull();

      // No timer: it waits for someone to act (WCAG 2.2.1).
      await act(() => vi.advanceTimersByTimeAsync(60_000));
      expect(screen.getByRole('status')).toBe(toast);
      expect(saved).not.toHaveBeenCalled();

      await user.click(
        within(toast).getByRole('button', { name: 'Try again' }),
      );

      expect(
        await screen.findByRole('combobox', { name: '语言' }),
      ).toBeInTheDocument();
      expect(localStorage.getItem('language')).toBe('zh-Hans');
      await waitFor(() =>
        expect(saved).toHaveBeenCalledWith({ locale: 'zh-Hans' }),
      );
      await waitFor(() =>
        expect(screen.queryByRole('status')).not.toBeInTheDocument(),
      );
    });

    it('closed, leaves everything as it was', async () => {
      const user = userEvent.setup({
        advanceTimers: (ms) => vi.advanceTimersByTime(ms),
      });
      const saved = watchSaves();
      failNextLoad();
      renderWithAuth(
        <>
          <LanguageSelect />
          <LanguageFailureToast />
        </>,
      );

      await user.click(screen.getByRole('combobox', { name: 'Language' }));
      await user.click(
        screen.getByRole('option', { name: '简体中文（测试版）' }),
      );
      await user.click(
        within(await screen.findByRole('status')).getByRole('button', {
          name: 'Close',
        }),
      );

      await waitFor(() =>
        expect(screen.queryByRole('status')).not.toBeInTheDocument(),
      );
      expect(
        screen.getByRole('combobox', { name: 'Language' }),
      ).toHaveTextContent('English');
      expect(localStorage.getItem('language')).toBeNull();
      expect(saved).not.toHaveBeenCalled();
    });

    it('a newer build: the page loads in full from it instead, saying nothing', async () => {
      const user = userEvent.setup({
        advanceTimers: (ms) => vi.advanceTimersByTime(ms),
      });
      server.use(
        http.get('/version.json', () =>
          HttpResponse.json({
            ...BUILD,
            build: 'a1b2c3d',
            apiRevision: API_REVISION,
          }),
        ),
      );
      // Through the real loader: tried twice, then the version file read.
      vi.mocked(loadMessages).mockImplementationOnce(() =>
        loadChunkOrReload(() =>
          Promise.reject(
            new TypeError(
              'Failed to fetch dynamically imported module: /assets/zh-Hans.js',
            ),
          ),
        ),
      );
      renderWithAuth(
        <>
          <LanguageSelect />
          <LanguageFailureToast />
        </>,
      );

      await user.click(screen.getByRole('combobox', { name: 'Language' }));
      await user.click(
        screen.getByRole('option', { name: '简体中文（测试版）' }),
      );
      await act(() => vi.advanceTimersByTimeAsync(1000));

      await waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(localStorage.getItem('language')).toBeNull();
    });
  });

  describe('at start', () => {
    it('a stored language falls back to English with the banner, and Try again loads it', async () => {
      localStorage.setItem('language', 'zh-Hans');
      failNextLoad();
      renderWithAuth(
        <>
          <LanguageFailureBanner />
          <LanguageSelect />
        </>,
      );

      const banner = await screen.findByRole('status');
      expect(banner).toHaveTextContent(
        'Couldn’t load 简体中文, so the app is in English for now.',
      );
      expect(within(banner).getByText('简体中文')).toHaveAttribute(
        'lang',
        'zh-Hans',
      );
      expect(
        screen.getByRole('combobox', { name: 'Language' }),
      ).toHaveTextContent('English');
      // This device's choice kept, for the next start.
      expect(localStorage.getItem('language')).toBe('zh-Hans');

      await userEvent.click(
        within(banner).getByRole('button', { name: 'Try again' }),
      );

      expect(
        await screen.findByRole('combobox', { name: '语言' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('the account asking for the same language: the banner goes on saying it, never a toast', async () => {
      localStorage.setItem('language', 'zh-Hans');
      failNextLoad();
      failNextLoad();
      render(
        <>
          <LanguageFailureBanner />
          <LanguageFailureToast />
          <AccountLanguage />
        </>,
      );

      expect(
        await screen.findByText(/so the app is in English for now/),
      ).toBeInTheDocument();
      // The account's ask loaded it again, and failed the same way.
      await waitFor(() => expect(loadMessages).toHaveBeenCalledTimes(2));
      await act(() => Promise.resolve());
      expect(screen.getAllByRole('status')).toHaveLength(1);
    });

    it('on Your account, choosing English instead puts the banner away and saves it', async () => {
      const saved = watchSaves();
      localStorage.setItem('language', 'zh-Hans');
      failNextLoad();
      renderWithAuth(
        <>
          <LanguageFailureBanner />
          <LanguageSelect account />
        </>,
        { user: { locale: 'zh-Hans' } },
      );

      await screen.findByRole('status');
      // The account's own choice, which would not load.
      expect(
        screen.getByRole('combobox', { name: 'Language' }),
      ).toHaveTextContent('简体中文（测试版）');
      await userEvent.click(screen.getByRole('combobox', { name: 'Language' }));
      await userEvent.click(screen.getByRole('option', { name: 'English' }));

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(localStorage.getItem('language')).toBe('en');
      await waitFor(() => expect(saved).toHaveBeenCalledWith({ locale: 'en' }));
    });
  });
});

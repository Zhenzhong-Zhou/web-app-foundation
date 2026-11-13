import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

import { api } from '../lib/api';
import { server } from '../test/setup';
import { intl } from './intl';
import { useLanguage } from './use-language';

/**
 * en-XA on the screens (ADR-054's November 2026 amendment, R9): the
 * catalogue made from English, while the server and the account are asked
 * in English, so a server message stays plain English.
 */
describe('LanguageProvider, in en-XA', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('shows en-XA, remembers it on this device and asks the server in English', async () => {
    let asked: string | null = null;
    server.use(
      http.get('/api/v1/ping', ({ request }) => {
        asked = request.headers.get('Accept-Language');
        return HttpResponse.json({});
      }),
    );
    const { result } = renderHook(() => useLanguage());

    await act(() => result.current.setLocale('en-XA'));

    expect(result.current.shown).toBe('en-XA');
    expect(result.current.locale).toBe('en');
    expect(
      intl().formatMessage({ id: 'help.title', defaultMessage: 'Help' }),
    ).toBe('[Ĥéĺp one]');
    expect(localStorage.getItem('language')).toBe('en-XA');
    await api('/ping');
    expect(asked).toBe('en');
  });

  it('keeps en-XA when the account’s language is English, and follows any other', async () => {
    const { result } = renderHook(() => useLanguage());
    await act(() => result.current.setLocale('en-XA'));

    await act(() => result.current.follow('en'));
    expect(result.current.shown).toBe('en-XA');

    await act(() => result.current.follow('fr-CA'));
    expect(result.current.shown).toBe('fr-CA');

    await act(() => result.current.follow('en'));
    expect(result.current.shown).toBe('en');
  });
});

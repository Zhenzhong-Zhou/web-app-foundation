import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reportFault } from './errors/report-fault';
import { ROOT_ROUTE } from './root-route';
import { sessionFor } from './test/render-with-auth';
import { server } from './test/setup';

/** The session read broken in this build, for the test that says so. */
const broken = vi.hoisted(() => ({ session: false }));

vi.mock('./auth/auth-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./auth/auth-provider')>();
  return {
    ...actual,
    AuthProvider: ({ children }: { children: ReactNode }) => {
      if (broken.session) throw new Error('The session read broken');
      return <actual.AuthProvider>{children}</actual.AuthProvider>;
    },
  };
});

/** The signed-in layout's frame broken in this build. */
vi.mock('./layout/app-layout', () => ({
  AppLayout: () => {
    throw new Error('The layout broken');
  },
}));

vi.mock('./errors/report-fault', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./errors/report-fault')>()),
  reportFault: vi.fn(),
}));

const renderAt = (at: string) =>
  render(
    <RouterProvider
      router={createMemoryRouter([ROOT_ROUTE], { initialEntries: [at] })}
    />,
  );

/**
 * A fault no boundary of ours holds (#244, ADR-084): the crash page on its
 * own, in the reader's language, with Reload and the reference it reports
 * once. It was React Router's own page, in English with the code's stack,
 * and reported nowhere.
 */
describe('the app’s route, when what it draws breaks', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(reportFault).mockClear();
    localStorage.setItem('language', 'zh-Hans');
  });

  afterEach(() => {
    localStorage.clear();
    broken.session = false;
  });

  async function expectCrashPage() {
    expect(
      await screen.findByRole('heading', { level: 1, name: '出错了' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: '重新加载' })).toBeVisible();
    expect(screen.queryByText('Unexpected Application Error!')).toBeNull();

    const reference = screen
      .getByText(/^参考编号/)
      .querySelector('code')?.textContent;
    expect(reference).toEqual(expect.any(String));
    expect(reportFault).toHaveBeenCalledExactlyOnceWith(expect.any(Error), {
      reference,
    });
  }

  it('a fault in the session read', async () => {
    broken.session = true;
    renderAt('/login');

    await expectCrashPage();
  });

  it('a fault in the signed-in layout’s frame', async () => {
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json(sessionFor({}))),
    );
    renderAt('/');

    await expectCrashPage();
  });
});

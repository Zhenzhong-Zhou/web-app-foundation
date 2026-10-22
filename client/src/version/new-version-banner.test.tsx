import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { API_REVISION } from '../api/revision.gen';
import { AuthLayout } from '../auth/auth-layout';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { BUILD } from './build';
import { reloadPage } from './reload-page';
import { checkVersion } from './version-check';

vi.mock('./reload-page', () => ({ reloadPage: vi.fn() }));

/** A deploy: the static host's version.json names another build. */
async function deploy(apiRevision = API_REVISION) {
  server.use(
    http.get('/version.json', () =>
      HttpResponse.json({ ...BUILD, build: 'a1b2c3d', apiRevision }),
    ),
  );
  await act(() => checkVersion());
}

const renderSignIn = () =>
  renderWithAuth(
    <AuthLayout title="Sign in">
      <p>The form</p>
    </AuthLayout>,
  );

/**
 * The pages before an account have no top bar, and nobody there is
 * mid-task, so a newer build is a banner there (ADR-081), with Reload and
 * no close.
 */
describe('a new version, signed out', () => {
  afterEach(async () => {
    vi.mocked(reloadPage).mockClear();
    server.resetHandlers();
    await checkVersion();
  });

  it('says nothing while the server has this tab’s build', async () => {
    renderSignIn();
    await act(() => checkVersion());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says a new version is ready, in the info tone, with Reload', async () => {
    const user = userEvent.setup();
    renderSignIn();
    await deploy();

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent(
      'A new version is ready. It loads when you open another page.',
    );
    expect(banner).toHaveClass('MuiAlert-colorInfo');
    expect(
      within(banner).queryByRole('button', { name: /close/i }),
    ).not.toBeInTheDocument();
    await user.click(within(banner).getByRole('button', { name: 'Reload' }));
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('turns amber once its saves would be refused', async () => {
    renderSignIn();
    await deploy(API_REVISION + 1);

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent(
      'A new version is ready, and this tab can no longer save changes. Copy anything you’ve typed, then reload.',
    );
    expect(banner).toHaveClass('MuiAlert-colorWarning');
  });
});

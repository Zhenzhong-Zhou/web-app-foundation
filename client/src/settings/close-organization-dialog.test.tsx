import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { OrganizationLastExport } from '../api/types.gen';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { CloseOrganizationDialog } from './close-organization-dialog';

/** GET /organization, with its last export, and every request sent. */
function organizationWith(lastExport: OrganizationLastExport | null) {
  const sent: unknown[] = [];
  server.use(
    http.get('/api/v1/organization', () =>
      HttpResponse.json({ organization: { name: 'Alpha Co', lastExport } }),
    ),
    http.post('/api/v1/organization/deletion', async ({ request }) => {
      sent.push(await request.json());
      return HttpResponse.json({ deletionScheduledAt: '2026-11-14' });
    }),
  );
  return sent;
}

function open(alone = false) {
  renderWithAuth(
    <CloseOrganizationDialog
      open
      alone={alone}
      onClose={() => undefined}
      onScheduled={() => undefined}
    />,
  );
  return screen.findByRole('dialog');
}

/**
 * Closing an organization (ADR-070, amended): the export or its decline,
 * the name, the password, and why Close stays off until all three.
 */
describe('CloseOrganizationDialog', () => {
  it('stays off and says why, until the export or a decline, the name and the password', async () => {
    const sent = organizationWith(null);
    const dialog = await open();
    const close = within(dialog).getByRole('button', {
      name: 'Close organization',
    });

    expect(close).toBeDisabled();
    expect(
      screen.getByText(
        'Still needed: the download, or “I don’t need a copy”, the name, and your password.',
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('checkbox', { name: /I don’t need a copy/ }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Organization name' }),
      'Alpha',
    );
    expect(close).toBeDisabled();
    expect(
      screen.getByText(
        'Not the same as the name. Capital and small letters count.',
      ),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Organization name' }),
      ' Co',
    );
    await userEvent.type(screen.getByLabelText(/Your password/), 'secret');
    expect(close).toBeEnabled();
    expect(screen.queryByText(/Still needed/)).not.toBeInTheDocument();

    await userEvent.click(close);
    expect(sent).toEqual([
      {
        organizationName: 'Alpha Co',
        password: 'secret',
        declineExport: true,
        deleteAccount: false,
      },
    ]);
  });

  it('counts a fresh download, and knows it was yours by id', async () => {
    const sent = organizationWith({
      exportedAt: new Date(Date.now() - 60_000).toISOString(),
      // Another member's name, the same as yours: the id decides.
      exportedBy: 'Owner',
      exportedById: 'user-1',
      fresh: true,
    });
    const dialog = await open();

    expect(await within(dialog).findByText(/by you$/)).toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText(/I don’t need a copy/),
    ).not.toBeInTheDocument();

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Organization name' }),
      'Alpha Co',
    );
    await userEvent.type(screen.getByLabelText(/Your password/), 'secret');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Close organization' }),
    );
    expect(sent).toEqual([expect.objectContaining({ declineExport: false })]);
  });

  it('asks again for a download older than a day', async () => {
    organizationWith({
      exportedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      exportedBy: 'Mei Lin',
      exportedById: 'user-2',
      fresh: false,
    });
    const dialog = await open();

    expect(
      await within(dialog).findByText(
        /by Mei Lin\. That’s more than a day old/,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('link', { name: 'Download everything (ZIP)' }),
    ).toHaveAttribute('href', '/api/v1/organization/export');
  });

  it('deletes the account too, for the only member', async () => {
    const sent = organizationWith(null);
    const dialog = await open(true);

    expect(
      within(dialog).getByRole('heading', {
        name: 'Delete your account and Alpha Co?',
      }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('checkbox', { name: /I don’t need a copy/ }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Organization name' }),
      'Alpha Co',
    );
    await userEvent.type(screen.getByLabelText(/Your password/), 'secret');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete both' }),
    );

    expect(sent).toEqual([expect.objectContaining({ deleteAccount: true })]);
  });

  it('names someone else of the same name, not you', async () => {
    organizationWith({
      exportedAt: new Date(Date.now() - 60_000).toISOString(),
      exportedBy: 'Owner',
      exportedById: 'user-2',
      fresh: true,
    });
    const dialog = await open();

    expect(await within(dialog).findByText(/by Owner$/)).toBeInTheDocument();
  });

  it('stops asking once the download is fresh', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let reads = 0;
      let fresh = false;
      server.use(
        http.get('/api/v1/organization', () => {
          reads += 1;
          return HttpResponse.json({
            organization: {
              name: 'Alpha Co',
              lastExport: fresh
                ? {
                    exportedAt: new Date().toISOString(),
                    exportedBy: 'Owner',
                    exportedById: 'user-1',
                    fresh: true,
                  }
                : null,
            },
          });
        }),
      );
      const dialog = await open();
      const user = userEvent.setup({
        advanceTimers: (ms) => vi.advanceTimersByTime(ms),
      });
      const link = within(dialog).getByRole('link', {
        name: 'Download everything (ZIP)',
      });
      // A plain link to a file: jsdom would try to navigate.
      link.addEventListener('click', (event) => event.preventDefault());
      await user.click(link);

      await vi.advanceTimersByTimeAsync(3_000);
      fresh = true;
      await vi.advanceTimersByTimeAsync(3_000);
      expect(await within(dialog).findByText(/by you$/)).toBeInTheDocument();
      const afterFresh = reads;

      await vi.advanceTimersByTimeAsync(30_000);
      expect(reads).toBe(afterFresh);
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks a refused password on its field, with the way on (#120)', async () => {
    organizationWith(null);
    server.use(
      http.post('/api/v1/organization/deletion', () =>
        HttpResponse.json(
          {
            statusCode: 401,
            code: 'password_incorrect',
            message: 'That password is not correct. Check it and try again.',
          },
          { status: 401 },
        ),
      ),
    );
    const dialog = await open();

    await userEvent.click(
      screen.getByRole('checkbox', { name: /I don’t need a copy/ }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Organization name' }),
      'Alpha Co',
    );
    const field = screen.getByLabelText(/Your password/);
    await userEvent.type(field, 'not-it');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Close organization' }),
    );

    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    expect(field).toHaveAccessibleDescription(
      'That password is not correct. Check it and try again.',
    );
    expect(
      within(dialog).getByRole('button', { name: 'Reset your password' }),
    ).toBeInTheDocument();
  });

  it('offers the download again when the server finds the export too old', async () => {
    let reads = 0;
    server.use(
      http.get('/api/v1/organization', () => {
        reads += 1;
        // Fresh when the dialog opens; stale by the time it is confirmed.
        return HttpResponse.json({
          organization: {
            name: 'Alpha Co',
            lastExport: {
              exportedAt: new Date().toISOString(),
              exportedBy: 'Owner',
              exportedById: 'user-1',
              fresh: reads === 1,
            },
          },
        });
      }),
      http.post('/api/v1/organization/deletion', () =>
        HttpResponse.json(
          {
            statusCode: 409,
            code: 'organization_export_required',
            message: 'Download the export first.',
          },
          { status: 409 },
        ),
      ),
    );
    const dialog = await open();
    expect(await within(dialog).findByText(/by you$/)).toBeInTheDocument();
    expect(within(dialog).getByText(/\(in 30 days\)/)).toBeInTheDocument();

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Organization name' }),
      'Alpha Co',
    );
    await userEvent.type(screen.getByLabelText(/Your password/), 'secret');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Close organization' }),
    );

    expect(
      await within(dialog).findByRole('link', {
        name: 'Download everything (ZIP)',
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('checkbox', { name: /I don’t need a copy/ }),
    ).toBeInTheDocument();
  });
});

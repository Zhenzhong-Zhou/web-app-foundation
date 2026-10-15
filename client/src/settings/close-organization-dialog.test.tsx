import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

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
        'Still needed: the export or “I don’t want the export”, the name, and your password.',
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText(/I don’t want the export/));
    await userEvent.type(screen.getByLabelText('Organization name'), 'Alpha');
    expect(close).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Organization name'), ' Co');
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

  it('counts a download from the last day, and names who took it', async () => {
    const sent = organizationWith({
      exportedAt: new Date(Date.now() - 60_000).toISOString(),
      exportedBy: 'Owner',
      exportedById: 'user-1',
      fresh: true,
    });
    const dialog = await open();

    expect(await within(dialog).findByText(/by you$/)).toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText(/I don’t want the export/),
    ).not.toBeInTheDocument();

    await userEvent.type(
      screen.getByLabelText('Organization name'),
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
    await userEvent.click(screen.getByLabelText(/I don’t want the export/));
    await userEvent.type(
      screen.getByLabelText('Organization name'),
      'Alpha Co',
    );
    await userEvent.type(screen.getByLabelText(/Your password/), 'secret');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete both' }),
    );

    expect(sent).toEqual([expect.objectContaining({ deleteAccount: true })]);
  });
});

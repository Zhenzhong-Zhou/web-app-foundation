import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { LicenceCheck, ProductionRun } from '../lib/types';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { ReleaseRunDialog } from './release-run-dialog';

/**
 * The licence part of release (ADR-050): the dialog shows what release will
 * do with the recipe's licence before Release is pressed, and asks for a
 * reason only from someone who may give one. The server decides either way
 * — these cover not offering a Release that can only fail, and sending an
 * override only when one is asked for.
 */

const RUN: ProductionRun = {
  id: 'run-1',
  outputVariantId: 'variant-output',
  bomId: 'bom-1',
  partnerId: null,
  locationId: 'loc-wip',
  quantityPlanned: '500.0000',
  quantityProduced: '0.0000',
  status: 'draft',
  reference: 'FOC-2610-01',
  licenceId: null,
  licenceNumber: null,
  licenceAuthority: null,
  licenceStatusAtRelease: null,
  licenceOverriddenBy: null,
  licenceOverrideReason: null,
  notes: null,
  createdAt: '2026-10-02T10:00:00.000Z',
};

const LICENCE = {
  id: 'licence-1',
  number: '80012345',
  authority: 'Health Canada',
  issuedAt: null,
  expiresAt: '2026-09-01T00:00:00.000Z',
};

/** Serves the plan with the given check, and records what release is sent. */
function serve(licenceCheck: LicenceCheck) {
  const sent: Record<string, unknown>[] = [];
  const plans: string[] = [];

  server.use(
    http.get('/api/v1/locations', () =>
      HttpResponse.json([
        { id: 'loc-shelf', name: 'SHELF', isAvailable: true },
      ]),
    ),
    http.get('/api/v1/production-orders/:id/issue-plan', ({ request }) => {
      plans.push(request.url);
      return HttpResponse.json({ lines: [], licenceCheck });
    }),
    http.post('/api/v1/production-orders/:id/release', async ({ request }) => {
      sent.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json({ lines: [] });
    }),
  );

  return Object.assign(sent, { plans });
}

async function openWithSource(canOverrideLicence: boolean) {
  const user = userEvent.setup();

  renderWithAuth(
    <ReleaseRunDialog
      open
      run={RUN}
      canOverrideLicence={canOverrideLicence}
      onClose={() => undefined}
      onReleased={() => undefined}
    />,
  );

  await user.click(await screen.findByLabelText(/Pick components from/));
  await user.click(await screen.findByRole('option', { name: 'SHELF' }));

  return user;
}

describe('ReleaseRunDialog licence', () => {
  it('asks the person who may override for a reason, and sends it', async () => {
    const sent = serve({
      licence: LICENCE,
      status: 'expired',
      outcome: 'override',
    });
    const user = await openWithSource(true);

    expect(await screen.findByText(/expired on/)).toBeInTheDocument();

    const release = screen.getByRole('button', { name: 'Release' });
    expect(release).toBeDisabled();

    await user.type(
      screen.getByLabelText(/Reason for releasing anyway/),
      'Renewal filed 3 Sept',
    );
    expect(release).toBeEnabled();

    await user.click(release);

    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].licenceOverride).toEqual({ reason: 'Renewal filed 3 Sept' });
  });

  it('does not offer Release to someone who cannot override', async () => {
    serve({ licence: LICENCE, status: 'expired', outcome: 'override' });
    await openWithSource(false);

    expect(
      await screen.findByText(/needs an override from someone allowed/),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Reason for releasing anyway/),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Release' })).toBeDisabled();
  });

  it('refuses a withdrawn licence with no way round it', async () => {
    serve({
      licence: { ...LICENCE, expiresAt: null },
      status: 'withdrawn',
      outcome: 'block',
    });
    await openWithSource(true);

    expect(await screen.findByText(/has been withdrawn/)).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Reason for releasing anyway/),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Release' })).toBeDisabled();
  });

  // Sent when not asked for, the server would still demand the permission.
  it('sends no override for a current licence', async () => {
    const sent = serve({
      licence: { ...LICENCE, expiresAt: null },
      status: 'current',
      outcome: 'allow',
    });
    const user = await openWithSource(true);

    expect(await screen.findByText(/current\./)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Release' }));

    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].licenceOverride).toBeUndefined();
  });

  // A business making nothing regulated never meets any of this.
  it('says nothing about licences for a recipe that needs none', async () => {
    const { plans } = serve({
      licence: null,
      status: 'none',
      outcome: 'allow',
    });
    await openWithSource(true);

    await expect.poll(() => plans.length).toBe(1);
    expect(screen.queryByText(/licence/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Release' })).toBeEnabled();
  });
});

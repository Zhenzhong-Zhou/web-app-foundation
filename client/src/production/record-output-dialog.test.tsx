import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';

import type { RunDetail } from '../api/types.gen';
import { apiError } from '../test/handlers';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { RecordOutputDialog } from './record-output-dialog';

/** A released run with no batch yet: its first output names one. */
const RUN: RunDetail = {
  id: 'run-1',
  outputVariantId: 'variant-output',
  bomId: 'bom-1',
  partnerId: null,
  locationId: 'loc-wip',
  quantityPlanned: '500.0000',
  quantityProduced: '0.0000',
  status: 'released',
  reference: null,
  licenceId: null,
  licenceNumber: null,
  licenceAuthority: null,
  licenceStatusAtRelease: null,
  licenceOverriddenBy: null,
  licenceOverriddenByName: null,
  licenceOverrideReason: null,
  notes: null,
  createdAt: '2026-09-15T10:00:00.000Z',
  lines: [],
  componentLots: [],
  outputLots: [],
};

const REFUSAL =
  'ASH-06O1 was the code of lot ASH-0601 until Nov 24, 2026. A code is never given to a second lot.';

describe('RecordOutputDialog', () => {
  // ADR-094 amended, R11, 8a: another lot's former code, refused under
  // the field with no button, since this field is not the shared one.
  it('says the server’s refusal of another lot’s former code under the batch number, focus there, with no button, what was typed kept', async () => {
    const sent: unknown[] = [];
    server.use(
      http.post(
        '/api/v1/production-orders/run-1/output',
        async ({ request }) => {
          sent.push(await request.json());
          return apiError(409, REFUSAL, 'lot_code_former');
        },
      ),
    );
    const user = userEvent.setup();
    renderWithAuth(
      <RecordOutputDialog
        open
        run={RUN}
        onClose={() => undefined}
        onRecorded={() => undefined}
      />,
    );

    await user.type(
      screen.getByRole('textbox', { name: /^Finished this time/ }),
      '1200',
    );
    const batch = screen.getByRole('textbox', { name: /^Batch number/ });
    await user.type(batch, 'ASH-06O1');
    await user.click(screen.getByRole('button', { name: 'Record' }));

    await waitFor(() => expect(batch).toHaveAccessibleDescription(REFUSAL));
    expect(batch).toHaveFocus();
    expect(batch).toBeInvalid();
    expect(screen.getAllByText(REFUSAL)).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: /^Use / }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /^Finished this time/ }),
    ).toHaveValue('1200');
    expect(sent).toEqual([{ quantity: '1200', lot: { code: 'ASH-06O1' } }]);

    // Another code typed: the refusal was of the one sent.
    await user.clear(batch);
    await user.type(batch, 'ASH-0602');
    expect(batch).toBeValid();
    expect(batch).not.toHaveAccessibleDescription();
  });
});

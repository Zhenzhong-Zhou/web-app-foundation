import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { Location } from '../api/types.gen';
import { server } from '../test/setup';
import { SiteAddressDialog } from './site-address-dialog';

const SITE: Location = {
  id: 'site-1',
  type: 'site',
  name: 'Burnaby warehouse',
  code: null,
  parentId: null,
  isAvailable: true,
  isActive: true,
  address: null,
};

describe('SiteAddressDialog', () => {
  it('sends the site’s address whole, blanks left out (ADR-071)', async () => {
    const user = userEvent.setup();
    const sent: Record<string, unknown>[] = [];
    server.use(
      http.put('/api/v1/locations/site-1/address', async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    render(
      <SiteAddressDialog
        site={SITE}
        onClose={() => undefined}
        onSaved={async () => undefined}
      />,
    );

    await user.type(
      screen.getByLabelText(/Address line 1/),
      '42 Production Way',
    );
    await user.type(screen.getByLabelText(/City/), 'Burnaby');
    await user.type(screen.getByLabelText(/Country/), 'CA');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]).toEqual({
      line1: '42 Production Way',
      city: 'Burnaby',
      country: 'CA',
    });
  });

  it('offers to remove an address the site has', () => {
    render(
      <SiteAddressDialog
        site={{
          ...SITE,
          address: {
            line1: '42 Production Way',
            line2: null,
            city: 'Burnaby',
            region: 'BC',
            postalCode: 'V5J 4R1',
            country: 'CA',
          },
        }}
        onClose={() => undefined}
        onSaved={async () => undefined}
      />,
    );

    expect(screen.getByLabelText(/Address line 1/)).toHaveValue(
      '42 Production Way',
    );
    expect(
      screen.getByRole('button', { name: 'Remove the address' }),
    ).toBeInTheDocument();
  });
});

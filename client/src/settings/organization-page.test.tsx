import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { OrganizationProfile } from '../api/types.gen';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { OrganizationPage } from './organization-page';

const ORGANIZATION: OrganizationProfile = {
  id: 'org-1',
  name: 'Alpha Co',
  slug: 'alpha-co',
  taxRegistrationNumber: null,
  whatWeDo: 'We import natural health products.',
  address: null,
  baseCurrency: 'CAD',
  defaultSalePriceListId: null,
  licenceNotInForcePolicy: 'block',
  licenceExpiredPolicy: 'block',
  licenceRequired: false,
  documentLanguage: 'en',
  documentSecondLanguage: null,
  requiredNameLanguages: [],
  productNameLanguage: 'en',
  logoFileId: null,
  squareLogoFileId: null,
  accentColor: null,
  rail: 'dark',
  logoOnDocuments: true,
  paperSize: null,
  timeZone: 'America/Vancouver',
  expiryWarningDays: 90,
  expiryCriticalDays: 30,
  idleSignOutMinutes: null,
  idleSignOutScope: 'unticked',
  lastExport: null,
};

function page(
  tab: string,
  organization: Partial<OrganizationProfile> = {},
  permissions = ['organizations.update'],
) {
  server.use(
    http.get('/api/v1/organization', () =>
      HttpResponse.json({ organization: { ...ORGANIZATION, ...organization } }),
    ),
  );
  renderWithAuth(
    <MemoryRouter initialEntries={[`/settings/organization?tab=${tab}`]}>
      <OrganizationPage />
    </MemoryRouter>,
    { permissions },
  );
}

/** A section by its heading. */
async function section(title: string) {
  const heading = await screen.findByRole('heading', { name: title });
  return heading.closest('form')!;
}

/** The Organization page's riders from #487 and #505. */
describe('OrganizationPage', () => {
  it('says there is no logo yet on Documents, its link opening Branding', async () => {
    const user = userEvent.setup();
    page('documents');

    const logo = await section('Logo on documents');
    await user.click(
      within(logo).getByRole('button', { name: 'Add one on Branding.' }),
    );

    const branding = screen.getByRole('tab', { name: 'Branding' });
    expect(branding).toHaveAttribute('aria-selected', 'true');
    expect(branding).toHaveFocus();
  });

  it('says nothing of a logo once there is one', async () => {
    page('documents', { logoFileId: 'file-1' });
    const logo = await section('Logo on documents');
    expect(within(logo).queryByText(/No logo yet/)).not.toBeInTheDocument();
  });

  it('sends no reader to Branding, a tab they do not have', async () => {
    page('documents', {}, []);
    const logo = await section('Logo on documents');
    expect(within(logo).queryByText(/No logo yet/)).not.toBeInTheDocument();
  });

  it('keeps every Save on Documents off until something changes', async () => {
    const user = userEvent.setup();
    page('documents');

    const logo = await section('Logo on documents');
    const paper = await section('Paper size');
    const saves = [
      within(logo).getByRole('button', { name: 'Save logo on documents' }),
      within(paper).getByRole('button', { name: 'Save paper size' }),
    ];
    for (const save of saves) {
      expect(save).toHaveAttribute('aria-disabled', 'true');
    }

    await user.click(within(logo).getByRole('switch'));
    await user.click(within(paper).getByRole('radio', { name: /^A4/ }));
    for (const save of saves) {
      expect(save).not.toHaveAttribute('aria-disabled');
    }

    // Back as saved, nothing to save.
    await user.click(within(logo).getByRole('switch'));
    await user.click(within(paper).getByRole('radio', { name: /^Automatic/ }));
    for (const save of saves) {
      expect(save).toHaveAttribute('aria-disabled', 'true');
    }
  });
});

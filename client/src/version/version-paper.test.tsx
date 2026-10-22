import { ThemeProvider } from '@mui/material/styles';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import type { Blocker } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { API_REVISION } from '../api/revision.gen';
import { UnsavedChangesDialog } from '../components/unsaved-changes-dialog';
import { DeleteDraftDialog } from '../invoices/delete-draft-dialog';
import { ProductGallery } from '../products/product-gallery';
import { server } from '../test/setup';
import { themeFor } from '../theme';
import { BUILD } from './build';
import { checkVersion } from './version-check';

/** A deploy whose API would refuse this tab's saves. */
async function deployUrgent() {
  server.use(
    http.get('/version.json', () =>
      HttpResponse.json({
        ...BUILD,
        build: 'a1b2c3d',
        apiRevision: API_REVISION + 1,
      }),
    ),
  );
  await act(() => checkVersion());
}

/** In the app's theme, whose dialog defaults add the line. */
const renderThemed = (ui: ReactNode) =>
  render(<ThemeProvider theme={themeFor('en')}>{ui}</ThemeProvider>);

const LINE =
  'A new version is ready, and this tab can no longer save changes. Copy anything you’ve typed, then reload.';

/**
 * The amber line at the very top of every dialog, above its title, once
 * this tab's saves would be refused (ADR-081): added once by the theme, so
 * no dialog had to change, and left out of the image viewer.
 */
describe('the amber line in dialogs', () => {
  afterEach(async () => {
    server.resetHandlers();
    await checkVersion();
  });

  it('tops a dialog opened once saves would be refused, above its title', async () => {
    await deployUrgent();
    renderThemed(
      <DeleteDraftDialog
        invoiceId="invoice-1"
        open
        onClose={() => undefined}
        onDeleted={() => undefined}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Delete this draft?' });
    const line = within(dialog).getByRole('status');
    expect(line).toHaveTextContent(LINE);
    expect(within(line).getByRole('button', { name: 'Reload' })).toBeVisible();
    expect(
      line.compareDocumentPosition(
        within(dialog).getByRole('heading', { name: 'Delete this draft?' }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('appears in a dialog already open, another one, when it turns urgent', async () => {
    const blocker = {
      state: 'blocked',
      reset: () => undefined,
      proceed: () => undefined,
    } as unknown as Blocker;
    renderThemed(
      <UnsavedChangesDialog blocker={blocker} message="Your role is lost." />,
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Leave without saving?',
    });
    expect(within(dialog).queryByRole('status')).not.toBeInTheDocument();

    await deployUrgent();
    expect(within(dialog).getByRole('status')).toHaveTextContent(LINE);
  });

  it('leaves the image viewer out, which only shows a picture', async () => {
    await deployUrgent();
    const user = userEvent.setup();
    renderThemed(
      <ProductGallery
        productId="product-1"
        productName="Calm Blend"
        images={[
          {
            fileId: 'file-1',
            position: 0,
            sizes: {},
          },
        ]}
        canEdit={false}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: /^Open Calm Blend, image 1 of 1/ }),
    );
    const viewer = await screen.findByRole('dialog');
    expect(within(viewer).queryByRole('status')).not.toBeInTheDocument();
  });
});

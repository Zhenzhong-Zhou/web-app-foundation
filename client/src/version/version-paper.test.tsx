import { ThemeProvider } from '@mui/material/styles';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { Blocker } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { UnsavedChangesDialog } from '../components/unsaved-changes-dialog';
import { DeleteDraftDialog } from '../invoices/delete-draft-dialog';
import { ProductGallery } from '../products/product-gallery';
import { deploy } from '../test/version';
import { themeFor } from '../theme';

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
  it('tops a dialog opened once saves would be refused, above its title', async () => {
    await deploy({ urgent: true });
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

    await deploy({ urgent: true });
    expect(within(dialog).getByRole('status')).toHaveTextContent(LINE);
  });

  it('says the new version’s arrival inside an open dialog, which hides the page’s announcement', async () => {
    renderThemed(
      <DeleteDraftDialog
        invoiceId="invoice-1"
        open
        onClose={() => undefined}
        onDeleted={() => undefined}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Delete this draft?' });
    const announcement = dialog.querySelector('[aria-live="polite"]')!;
    expect(announcement).toBeEmptyDOMElement();

    await deploy();
    expect(announcement).toHaveTextContent(
      'A new version is ready. It loads by itself when you open another page. Everything you’ve saved is kept; you don’t need to do anything.',
    );
  });

  it('leaves the image viewer out, which only shows a picture', async () => {
    await deploy({ urgent: true });
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

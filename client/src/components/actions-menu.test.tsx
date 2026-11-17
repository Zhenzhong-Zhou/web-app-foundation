import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithAuth } from '../test/render-with-auth';
import { ActionsMenu } from './actions-menu';

describe('ActionsMenu', () => {
  // Actions in words, named for the row, saying it opens a menu (#358).
  it('reads "Actions", is named for its row and says it opens a menu', async () => {
    renderWithAuth(
      <ActionsMenu
        name="Actions for VITC-100"
        actions={[{ label: 'Movements', onSelect: () => undefined }]}
      />,
    );

    const button = screen.getByRole('button', { name: 'Actions for VITC-100' });
    expect(button).toHaveTextContent('Actions');
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(button);
    expect(await screen.findByRole('menu')).toBeVisible();
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  // Once the menu has closed, so no dialog opens over a focused button.
  it('runs the choice once the menu has closed', async () => {
    const onSelect = vi.fn();
    renderWithAuth(
      <ActionsMenu
        name="Actions for VITC-100"
        actions={[
          { label: 'Move', onSelect },
          { label: 'Remove', onSelect: () => undefined, danger: true },
        ]}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for VITC-100' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move' }));

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('draws nothing with nothing to offer', () => {
    renderWithAuth(<ActionsMenu name="Actions for VITC-100" actions={[]} />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});

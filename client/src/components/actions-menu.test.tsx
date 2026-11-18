import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithAuth } from '../test/render-with-auth';
import { ActionsMenu } from './actions-menu';

describe('ActionsMenu', () => {
  // Actions in words, named for the row, saying it opens a menu (#358).
  it('reads "Actions", is named for its row and says it opens a menu', async () => {
    renderWithAuth(
      <ActionsMenu
        name="Actions for Vitamin C"
        groups={[[{ label: 'Movements', onSelect: () => undefined }]]}
      />,
    );

    const button = screen.getByRole('button', {
      name: 'Actions for Vitamin C',
    });
    expect(button).toHaveTextContent('Actions');
    // Its small down arrow after the word, as the boards draw it.
    expect(
      within(button).getByTestId('KeyboardArrowDownIcon'),
    ).toBeInTheDocument();
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
        name="Actions for Vitamin C"
        groups={[
          [{ label: 'Move…', onSelect }],
          [{ label: 'Remove', onSelect: () => undefined, danger: true }],
        ]}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for Vitamin C' }),
    );
    // A divider between the groups.
    expect(screen.getByRole('separator')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move…' }));

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(onSelect).toHaveBeenCalledOnce();
  });

  // ADR-093 v3: greyed with its reason, still reached, doing nothing.
  it('greys a choice that cannot be done, its reason beneath, still reached by the keyboard', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderWithAuth(
      <ActionsMenu
        name="Actions for Vitamin C"
        note="3 lots in 2 places: you choose the lot next"
        groups={[
          [
            {
              label: 'Move…',
              onSelect,
              unavailable: 'Nothing on hand to move',
            },
            { label: 'Correct the count…', onSelect: () => undefined },
          ],
        ]}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Actions for Vitamin C' }),
    );
    const menu = await screen.findByRole('menu');
    expect(menu).toHaveAccessibleDescription(
      '3 lots in 2 places: you choose the lot next',
    );
    const move = within(menu).getByRole('menuitem', { name: /^Move…/ });
    expect(move).toHaveAttribute('aria-disabled', 'true');
    expect(move).toHaveTextContent('Nothing on hand to move');
    // Reached by the keyboard: Home moves to it, as to any first choice.
    await user.keyboard('{End}{Home}');
    expect(move).toHaveFocus();

    await user.click(move);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeVisible();
  });

  it('draws nothing with nothing to offer', () => {
    renderWithAuth(
      <ActionsMenu name="Actions for Vitamin C" groups={[[], []]} />,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });
});

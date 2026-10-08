import {
  render,
  screen,
  waitForElementToBeRemoved,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useNavigate,
} from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { UnsavedChangesDialog } from '../components/unsaved-changes-dialog';
import { TestProviders } from '../test/test-providers';
import { useUnsavedChanges } from './use-unsaved-changes';

/** A form with one field, a link away, and a save that navigates. */
function Form() {
  const [name, setName] = useState('');
  const navigate = useNavigate();
  const { blocker, release } = useUnsavedChanges(name !== '');

  return (
    <>
      <UnsavedChangesDialog
        blocker={blocker}
        message="The draft will be lost."
      />
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <Link to="/elsewhere">Elsewhere</Link>
      <button
        type="button"
        onClick={() => {
          release();
          void navigate('/saved');
        }}
      >
        Save
      </button>
    </>
  );
}

function renderForm() {
  const router = createMemoryRouter(
    [
      { path: '/form', element: <Form /> },
      { path: '/elsewhere', element: <h1>Elsewhere page</h1> },
      { path: '/saved', element: <h1>Saved page</h1> },
    ],
    { initialEntries: ['/form'] },
  );
  render(<RouterProvider router={router} />, { wrapper: TestProviders });
  return router;
}

describe('useUnsavedChanges', () => {
  it('lets an untouched form go without asking', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('link', { name: 'Elsewhere' }));
    expect(await screen.findByText('Elsewhere page')).toBeTruthy();
  });

  it('asks before throwing changes away; Stay keeps them, Leave goes', async () => {
    const user = userEvent.setup();
    const router = renderForm();

    await user.type(screen.getByLabelText('Name'), 'Northside');
    await user.click(screen.getByRole('link', { name: 'Elsewhere' }));

    expect(await screen.findByText('Leave without saving?')).toBeTruthy();
    expect(screen.getByText('The draft will be lost.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Stay' }));
    // The dialog closes, and with it the page is reachable again.
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'));
    expect(router.state.location.pathname).toBe('/form');
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe(
      'Northside',
    );

    await user.click(screen.getByRole('link', { name: 'Elsewhere' }));
    await user.click(await screen.findByRole('button', { name: 'Leave' }));
    expect(await screen.findByText('Elsewhere page')).toBeTruthy();
  });

  it('does not ask after a save, which releases the navigation', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Name'), 'Northside');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Saved page')).toBeTruthy();
    expect(screen.queryByText('Leave without saving?')).toBeNull();
  });
});

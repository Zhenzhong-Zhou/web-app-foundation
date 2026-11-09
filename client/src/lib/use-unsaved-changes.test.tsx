import {
  render,
  screen,
  waitFor,
  waitForElementToBeRemoved,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lazy, type ReactNode, Suspense, useState } from 'react';
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
      <Link to="/slow">Slow</Link>
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

/** A page whose code never arrives, as on a slow connection (issue #514). */
const NeverLoaded = lazy(() => new Promise<never>(() => {}));

/** One boundary for every page, as App's `split` places it. */
function page(element: ReactNode) {
  return <Suspense fallback={<p>Loading</p>}>{element}</Suspense>;
}

function renderForm() {
  const router = createMemoryRouter(
    [
      { path: '/form', element: page(<Form />) },
      { path: '/elsewhere', element: page(<h1>Elsewhere page</h1>) },
      { path: '/saved', element: page(<h1>Saved page</h1>) },
      { path: '/slow', element: page(<NeverLoaded />) },
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

  it('lets Back through after Leave, while the next page is still loading', async () => {
    const user = userEvent.setup();
    const router = renderForm();

    await user.type(screen.getByLabelText('Name'), 'Northside');
    await user.click(screen.getByRole('link', { name: 'Slow' }));
    await user.click(await screen.findByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/slow'));
    // The form is still drawn, with its blocker, until the code arrives.
    expect(screen.getByLabelText('Name')).toBeTruthy();

    await router.navigate(-1);
    expect(router.state.location.pathname).toBe('/form');
    expect(screen.getByLabelText('Name')).toBeTruthy();
  });
});

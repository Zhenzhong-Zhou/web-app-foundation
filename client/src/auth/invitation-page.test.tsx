import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  CurrentSession,
  InvitationPreview,
  OrganizationInvitationPreview,
} from '../api/types.gen';
import { browserTimeZone } from '../lib/time-zone';
import { server } from '../test/setup';
import { AuthContext } from './auth-context';
import { InvitationPage } from './invitation-page';

const TOKEN = 'a-token-of-forty-three-characters-000000000';

function preview(over: Partial<InvitationPreview> = {}): InvitationPreview {
  return {
    email: 'sam@example.com',
    organization: { name: 'Alpha Co', logo: null, deletionScheduledAt: null },
    inviter: { name: 'Mei Lin', email: 'mei.lin@example.com' },
    roles: [
      { name: 'Viewer', description: 'Looks at orders.', system: 'Viewer' },
    ],
    note: 'Bring boots',
    lastDay: '2026-10-26',
    hasAccount: false,
    locale: 'en',
    ...over,
  };
}

/** Signed in as the invitation's address, in no organization yet. */
const SAM: CurrentSession = {
  user: {
    id: 'user-sam',
    email: 'sam@example.com',
    name: 'Sam Lee',
    emailVerified: true,
    locale: null,
  },
  organization: null,
  permissions: [],
};

/**
 * Accepting refused, the account set to be deleted, until Keep my account
 * clears it; refresh() reads the session as that server holds it.
 */
function deletionUntilKept(refusal: string) {
  let deletionScheduledAt: string | null = '2026-11-18';
  server.use(
    http.post('/api/v1/auth/login', () =>
      HttpResponse.json({ user: SAM.user }),
    ),
    http.post('/api/v1/invitations/accept', () =>
      deletionScheduledAt
        ? HttpResponse.json(
            {
              statusCode: 409,
              message: refusal,
              code: 'account_deletion_scheduled',
              details: { day: deletionScheduledAt },
            },
            { status: 409 },
          )
        : HttpResponse.json({ user: SAM.user }),
    ),
    http.delete('/api/v1/account/deletion', () => {
      deletionScheduledAt = null;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return (): CurrentSession => ({
    ...SAM,
    user: { ...SAM.user, deletionScheduledAt },
  });
}

function reads(invitation: InvitationPreview | null) {
  server.use(
    http.post('/api/v1/invitations/read', () =>
      HttpResponse.json({ invitation }),
    ),
  );
}

/**
 * The page at its link, with a session that refresh() sets to `after`,
 * as the real provider reads it again from the server; given as a
 * function, read at each refresh, for a server a test's handler changes.
 */
function open({
  session = null,
  after = session,
}: {
  session?: CurrentSession | null;
  after?: CurrentSession | null | (() => CurrentSession | null);
} = {}) {
  function Auth() {
    const [current, setCurrent] = useState(session);
    return (
      <AuthContext.Provider
        value={{
          session: current,
          loading: false,
          error: null,
          refresh: () => {
            setCurrent(typeof after === 'function' ? after() : after);
            return Promise.resolve();
          },
        }}
      >
        <MemoryRouter initialEntries={[`/invitation?token=${TOKEN}`]}>
          <Routes>
            <Route path="/invitation" element={<InvitationPage />} />
            <Route path="/" element={<p>Home</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );
  }
  return render(<Auth />);
}

/** A sentence whose words sit in several elements, bold role and all. */
const sentence = (text: string) => (_: string, element: Element | null) =>
  element?.tagName === 'P' && element.textContent === text;

describe('InvitationPage (ADR-077)', () => {
  beforeEach(() => {
    // The page's language choice is remembered on the device.
    localStorage.clear();
  });

  it('names the inviter by name and by address, as the email does', async () => {
    reads(preview());
    open();

    expect(
      await screen.findByText(
        sentence('Mei Lin (mei.lin@example.com) invited you as a Viewer.'),
      ),
    ).toBeVisible();
    expect(screen.getByText('From Mei Lin')).toBeVisible();
  });

  it('names only the organization once the inviter has gone', async () => {
    reads(preview({ inviter: null }));
    open();

    expect(
      await screen.findByText(sentence('Alpha Co invited you as a Viewer.')),
    ).toBeVisible();
    expect(screen.getByText('From Alpha Co')).toBeVisible();
    expect(screen.queryByText(/Mei Lin/)).not.toBeInTheDocument();
  });

  // ADR-080: a made role takes no article, several read as a list, each
  // line beside its role's name.
  it('names made roles bare, and several as a list with their lines', async () => {
    reads(
      preview({
        roles: [
          {
            name: 'Warehouse',
            description: 'Receives and ships.',
            system: null,
          },
          { name: 'Sales', description: null, system: null },
        ],
      }),
    );
    open();

    expect(
      await screen.findByText(
        sentence(
          'Mei Lin (mei.lin@example.com) invited you as Warehouse and Sales.',
        ),
      ),
    ).toBeVisible();
    expect(screen.getByText('Warehouse: Receives and ships.')).toBeVisible();
  });

  it('reads an ended link as ended, by its code', async () => {
    reads(preview());
    server.use(
      http.post('/api/v1/invitations/accept', () =>
        HttpResponse.json(
          {
            statusCode: 400,
            message: 'This invitation has ended.',
            code: 'invitation_ended',
          },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    open();

    await user.type(
      await screen.findByRole('textbox', { name: 'Your name' }),
      'Sam',
    );
    await user.type(
      screen.getByLabelText(/^Choose a password/),
      'a-password-of-mine',
    );
    await user.click(screen.getByRole('button', { name: 'Join Alpha Co' }));
    expect(
      await screen.findByRole('heading', { name: 'This invitation has ended' }),
    ).toBeVisible();
  });

  it('says a field the server refused as it says it, the link still live', async () => {
    reads(preview());
    server.use(
      http.post('/api/v1/invitations/accept', () =>
        HttpResponse.json(
          {
            statusCode: 400,
            message: 'name must be longer than or equal to 1 characters',
          },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    open();

    await user.type(
      await screen.findByRole('textbox', { name: 'Your name' }),
      '   ',
    );
    await user.type(
      screen.getByLabelText(/^Choose a password/),
      'a-password-of-mine',
    );
    await user.click(screen.getByRole('button', { name: 'Join Alpha Co' }));
    expect(
      await screen.findByText(
        'name must be longer than or equal to 1 characters',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Join Alpha Co' })).toBeEnabled();
    expect(
      screen.queryByRole('heading', { name: 'This invitation has ended' }),
    ).not.toBeInTheDocument();
  });

  it('starts in the invitation’s language for a newcomer', async () => {
    reads(preview({ locale: 'fr-CA' }));
    open();

    expect(
      await screen.findByRole('heading', { name: 'Joignez-vous à Alpha Co' }),
    ).toBeVisible();
  });

  it('keeps a signed-in account in its own language', async () => {
    reads(preview({ locale: 'fr-CA' }));
    open({ session: SAM });

    expect(
      await screen.findByRole('button', { name: 'Join Alpha Co' }),
    ).toBeVisible();
    expect(localStorage.getItem('language')).toBeNull();
  });

  it('joins as the account it signed in to when Join was refused just after, signing in once', async () => {
    reads(preview({ hasAccount: true }));
    let signIns = 0;
    let joins = 0;
    server.use(
      http.post('/api/v1/auth/login', () => {
        signIns += 1;
        return HttpResponse.json({ user: SAM.user });
      }),
      http.post('/api/v1/invitations/accept', () => {
        joins += 1;
        return joins === 1
          ? HttpResponse.json(
              { statusCode: 503, message: 'The server is busy.' },
              { status: 503 },
            )
          : HttpResponse.json({ user: SAM.user });
      }),
    );
    const user = userEvent.setup();
    open({ after: SAM });

    await user.type(
      await screen.findByLabelText(/^Password/),
      'my-own-password',
    );
    await user.click(screen.getByRole('button', { name: 'Sign in and join' }));

    // Signed in now: Join as that account, the refusal carried with it.
    expect(await screen.findByText('The server is busy.')).toBeVisible();
    expect(
      screen.getByText(/You’re signed in as sam@example\.com\./),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Join Alpha Co' }));

    expect(await screen.findByText('Home')).toBeVisible();
    expect({ signIns, joins }).toEqual({ signIns: 1, joins: 2 });
  });

  it('keeps the form as typed, in its language, when a read in another fails', async () => {
    let tries = 0;
    server.use(
      http.post('/api/v1/invitations/read', () => {
        tries += 1;
        return tries === 1
          ? HttpResponse.json({ invitation: preview() })
          : HttpResponse.json(
              { statusCode: 429, message: 'Too many requests' },
              { status: 429 },
            );
      }),
    );
    const user = userEvent.setup();
    open();

    await user.type(
      await screen.findByRole('textbox', { name: 'Your name' }),
      'Sam Lee',
    );
    await user.click(screen.getByRole('combobox', { name: 'Language' }));
    await user.click(
      screen.getByRole('option', { name: 'Français (Canada) — bêta' }),
    );

    expect(
      await screen.findByText(
        'The page couldn’t change language just now, so it stays as it was. Try again in a minute.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Your name' })).toHaveValue(
      'Sam Lee',
    );
    expect(screen.getByRole('button', { name: 'Join Alpha Co' })).toBeVisible();
    expect(
      screen.queryByText('This invitation could not be opened'),
    ).not.toBeInTheDocument();
    expect(tries).toBe(2);
  });

  it('says so when Not you? Sign out fails, and stays', async () => {
    reads(preview());
    server.use(
      http.post('/api/v1/auth/logout', () =>
        HttpResponse.json(
          { statusCode: 503, message: 'The server is busy.' },
          { status: 503 },
        ),
      ),
    );
    const user = userEvent.setup();
    open({ session: SAM });

    await user.click(
      await screen.findByRole('button', { name: 'Not you? Sign out' }),
    );
    expect(await screen.findByText('The server is busy.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Join Alpha Co' })).toBeVisible();
  });

  it('drops a refusal carried past Keep my account once the account is kept', async () => {
    reads(preview({ hasAccount: true }));
    const after = deletionUntilKept(
      'Your account is set to be deleted after 2026-11-18. Keep your account, then join.',
    );
    const user = userEvent.setup();
    open({ after });

    await user.type(
      await screen.findByLabelText(/^Password/),
      'a-password-of-mine',
    );
    await user.click(screen.getByRole('button', { name: 'Sign in and join' }));
    await user.click(
      await screen.findByRole('button', { name: 'Keep my account' }),
    );

    expect(
      await screen.findByRole('button', { name: 'Join Alpha Co' }),
    ).toBeVisible();
    expect(screen.queryByText(/set to be deleted/)).not.toBeInTheDocument();
  });

  it('offers Try again when the invitation could not be read', async () => {
    let tries = 0;
    server.use(
      http.post('/api/v1/invitations/read', () => {
        tries += 1;
        return tries === 1
          ? HttpResponse.json(
              { statusCode: 503, message: 'The server is busy.' },
              { status: 503 },
            )
          : HttpResponse.json({ invitation: preview() });
      }),
    );
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('button', { name: 'Join Alpha Co' }),
    ).toBeVisible();
  });
});

/** An organization invitation (ADR-078): the same page sets one up. */
describe('InvitationPage, an organization invitation', () => {
  function offer(
    over: Partial<OrganizationInvitationPreview> = {},
  ): OrganizationInvitationPreview {
    return {
      email: 'sam@example.com',
      organizationName: 'Harbour Herbs',
      role: {
        name: 'Owner',
        description:
          'Everything, including costs, issuing invoices, settings and closing the organization.',
      },
      lastDay: '2026-10-27',
      hasAccount: false,
      locale: 'en',
      ...over,
    };
  }

  function offers(organizationInvitation: OrganizationInvitationPreview) {
    server.use(
      http.post('/api/v1/invitations/read', () =>
        HttpResponse.json({ invitation: null, organizationInvitation }),
      ),
    );
  }

  it('sets up a new organization as its Owner, sending this browser’s zone', async () => {
    offers(offer());
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/v1/invitations/accept', async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ user: SAM.user });
      }),
    );
    const user = userEvent.setup();
    open();

    expect(
      await screen.findByRole('heading', { name: 'Set up Harbour Herbs' }),
    ).toBeVisible();
    expect(screen.getByText('A new organization')).toBeVisible();
    expect(screen.getByText(/Not your address\?/)).toBeVisible();

    await user.type(
      screen.getByRole('textbox', { name: 'Your name' }),
      'Chen Jie',
    );
    await user.type(
      screen.getByLabelText(/^Choose a password/),
      'a-password-of-mine',
    );
    await user.click(
      screen.getByRole('button', { name: 'Set up Harbour Herbs' }),
    );

    expect(await screen.findByText('Home')).toBeVisible();
    expect(sent).toMatchObject({
      name: 'Chen Jie',
      password: 'a-password-of-mine',
      timeZone: browserTimeZone(),
    });
  });

  it('goes on after the Owner’s colon in lower case, in French', async () => {
    // As the server sends it, in the invitation's language.
    offers(
      offer({
        locale: 'fr-CA',
        role: {
          name: 'Propriétaire',
          description:
            'Tout, y compris les coûts, l’émission des factures, les paramètres et la fermeture de l’organisation.',
        },
      }),
    );
    open();

    expect(
      await screen.findByText(
        (_, element) =>
          element?.tagName === 'P' &&
          /^Vous en serez Propriétaire\s:\stout, y compris les coûts/.test(
            element.textContent ?? '',
          ),
      ),
    ).toBeVisible();
  });

  it('signs an account with this address in, then sets it up in this browser’s zone', async () => {
    offers(offer({ hasAccount: true }));
    let signedIn: Record<string, unknown> | null = null;
    let accepted: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/v1/auth/login', async ({ request }) => {
        signedIn = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ user: SAM.user });
      }),
      http.post('/api/v1/invitations/accept', async ({ request }) => {
        accepted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ user: SAM.user });
      }),
    );
    const user = userEvent.setup();
    open({ after: SAM });

    expect(
      await screen.findByText(/You already have an account with this address/),
    ).toBeVisible();
    await user.type(screen.getByLabelText(/^Password/), 'a-password-of-mine');
    await user.click(
      screen.getByRole('button', { name: 'Sign in and set it up' }),
    );

    expect(await screen.findByText('Home')).toBeVisible();
    expect(signedIn).toMatchObject({
      email: 'sam@example.com',
      password: 'a-password-of-mine',
    });
    expect(accepted).toEqual({ token: TOKEN, timeZone: browserTimeZone() });
  });

  it('offers to sign out when signed in as another address', async () => {
    offers(offer());
    open({
      session: { ...SAM, user: { ...SAM.user, email: 'tom@example.com' } },
    });

    expect(
      await screen.findByRole('heading', {
        name: 'This invitation is for sam@example.com',
      }),
    ).toBeVisible();
    expect(
      screen.getByText(/You’re signed in as tom@example\.com/),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  it('asks an account set to be deleted to keep it, then offers Set up', async () => {
    offers(offer());
    let kept = false;
    server.use(
      http.delete('/api/v1/account/deletion', () => {
        kept = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    open({
      session: {
        ...SAM,
        user: { ...SAM.user, deletionScheduledAt: '2026-11-18' },
      },
      after: SAM,
    });

    expect(
      await screen.findByRole('heading', {
        name: 'Keep your account to set it up',
      }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Keep my account' }));

    expect(
      await screen.findByRole('button', { name: 'Set up Harbour Herbs' }),
    ).toBeVisible();
    expect(kept).toBe(true);
  });

  it('drops a refusal carried past Keep my account once the account is kept', async () => {
    offers(offer({ hasAccount: true }));
    const after = deletionUntilKept(
      'Your account is set to be deleted after 2026-11-18. Keep your account, then set up the organization.',
    );
    const user = userEvent.setup();
    open({ after });

    await user.type(
      await screen.findByLabelText(/^Password/),
      'a-password-of-mine',
    );
    await user.click(
      screen.getByRole('button', { name: 'Sign in and set it up' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Keep my account' }),
    );

    expect(
      await screen.findByRole('button', { name: 'Set up Harbour Herbs' }),
    ).toBeVisible();
    expect(screen.queryByText(/set to be deleted/)).not.toBeInTheDocument();
  });

  it('tells an account in an organization it cannot start one with it yet', async () => {
    offers(offer());
    open({
      session: {
        ...SAM,
        organization: {
          id: 'org-1',
          name: 'Alpha Co',
        } as CurrentSession['organization'],
      },
    });

    expect(
      await screen.findByRole('heading', {
        name: 'You can’t start an organization with this account yet',
      }),
    ).toBeVisible();
  });

  it('reads an ended link as ended, by its code', async () => {
    offers(offer());
    server.use(
      http.post('/api/v1/invitations/accept', () =>
        HttpResponse.json(
          {
            statusCode: 400,
            message: 'This invitation has ended.',
            code: 'invitation_ended',
          },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    open({ session: SAM });

    await user.click(
      await screen.findByRole('button', { name: 'Set up Harbour Herbs' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'This invitation has ended' }),
    ).toBeVisible();
  });
});

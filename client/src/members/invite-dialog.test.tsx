import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { Invitation, Role } from '../api/types.gen';
import { builtInRole, roleRef } from '../test/factories';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { InviteDialog } from './invite-dialog';
import type { InviteView } from './invite-view';

const ROLES: Role[] = [
  builtInRole('Owner'),
  builtInRole('Admin'),
  builtInRole('Viewer'),
];

/** A role the organization made, Finance, with what it is for. */
const FINANCE: Role = {
  ...builtInRole('Viewer'),
  id: 'role-finance',
  name: 'Finance',
  description: 'Invoices from draft to issued.',
  builtIn: false,
};

/** As an Admin reads the roles: no Owner, and no Finance, to give. */
const ADMINS_ROLES: Role[] = [
  builtInRole('Owner', { mayGive: false }),
  builtInRole('Admin'),
  builtInRole('Viewer'),
  { ...FINANCE, mayGive: false },
];

function invitation(over: Partial<Invitation> = {}): Invitation {
  return {
    id: 'inv-1',
    email: 'sam@example.com',
    roles: [roleRef('Viewer')],
    invitedBy: { id: 'user-2', name: 'Mei Lin' },
    invitedAt: '2026-10-19T09:00:00.000Z',
    link: { status: 'emailed', lastDay: '2026-10-26' },
    ...over,
  };
}

/** The server's refusal, as the exception filter shapes it. */
function refusal(status: number, body: Record<string, unknown>) {
  return HttpResponse.json(
    { statusCode: status, path: '/v1/invitations', ...body },
    { status },
  );
}

/**
 * Members as the dialog sees it: the lists it was given, and onChanged,
 * which reads them again, here to `next` once it is called.
 */
function Members({
  start = { kind: 'form' },
  roles = ROLES,
  invitations = [],
  next = invitations,
  onChanged = () => undefined,
}: {
  start?: InviteView;
  roles?: Role[];
  invitations?: Invitation[];
  next?: Invitation[];
  onChanged?: () => void;
}) {
  const [shown, setShown] = useState(invitations);
  return (
    <InviteDialog
      open
      start={start}
      roles={roles}
      members={[]}
      invitations={shown}
      onClose={() => undefined}
      onChanged={() => {
        onChanged();
        setShown(next);
        return Promise.resolve();
      }}
    />
  );
}

async function send(user: ReturnType<typeof userEvent.setup>, how: string) {
  await user.type(
    screen.getByRole('textbox', { name: 'Email' }),
    'sam@example.com',
  );
  await user.click(screen.getByRole('button', { name: how }));
}

describe('InviteDialog (ADR-077)', () => {
  it('keeps an invitation whose email did not go, and offers its link', async () => {
    server.use(
      http.post('/api/v1/invitations', () =>
        HttpResponse.json(
          {
            invitation: invitation({
              link: { status: 'notSent', lastDay: null },
            }),
            link: null,
          },
          { status: 201 },
        ),
      ),
      http.post('/api/v1/invitations/inv-1/link', () =>
        HttpResponse.json({
          invitation: invitation({
            link: { status: 'copied', lastDay: '2026-10-26' },
          }),
          link: 'https://app.example.com/invitation?token=abc',
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithAuth(<Members />);

    await send(user, 'Send invitation');
    const failed = await screen.findByRole('dialog', {
      name: 'Couldn’t send the email',
    });
    expect(failed).toHaveTextContent(
      'We couldn’t send the invitation email to sam@example.com.',
    );

    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(
      await screen.findByRole('dialog', { name: 'Link copied' }),
    ).toBeVisible();
  });

  it('says each failed try again, so Try again is seen to work', async () => {
    server.use(
      http.post('/api/v1/invitations/inv-1/resend', () =>
        HttpResponse.json({
          invitation: invitation({
            link: { status: 'notSent', lastDay: null },
          }),
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithAuth(
      <Members
        start={{
          kind: 'notSent',
          invitation: invitation({
            link: { status: 'notSent', lastDay: null },
          }),
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByText(
        'We tried again and still couldn’t send the invitation email to sam@example.com.',
      ),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByText(
        'We tried 2 more times and still couldn’t send the invitation email to sam@example.com.',
      ),
    ).toBeVisible();
  });

  it('says from when the next link can be made, in the reader’s own time', async () => {
    server.use(
      http.post('/api/v1/invitations', () =>
        refusal(409, {
          message: 'Your organization has made 50 invitation links.',
          code: 'invitations_daily_limit',
          details: { at: '2026-10-19T06:20:00.000Z' },
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithAuth(<Members />);

    await send(user, 'Send invitation');
    // 06:20 UTC is 3:20 PM in Tokyo, where the tests run.
    expect(
      await screen.findByText(
        'Alpha Co has made 50 invitation links in the last 24 hours, the most allowed. You can invite again from 3:20 PM.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByText('Your organization has made 50 invitation links.'),
    ).not.toBeInTheDocument();
  });

  it('says the limit in the reader’s own time when Resend instead meets it too', async () => {
    const earlier = invitation({ id: 'inv-9' });
    server.use(
      http.post('/api/v1/invitations', () =>
        refusal(409, {
          message: 'That address has already been invited.',
          code: 'already_invited',
          details: { invitationId: 'inv-9' },
        }),
      ),
      http.post('/api/v1/invitations/inv-9/resend', () =>
        refusal(409, {
          message: 'Your organization has made 50 invitation links.',
          code: 'invitations_daily_limit',
          details: { at: '2026-10-19T06:20:00.000Z' },
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithAuth(<Members invitations={[earlier]} />);

    await send(user, 'Send invitation');
    await user.click(
      await screen.findByRole('button', { name: 'Resend instead' }),
    );
    expect(
      await screen.findByText(/You can invite again from 3:20 PM\.$/),
    ).toBeVisible();
  });

  it('reads the lists again when a refusal names an invitation they lack, then offers Resend', async () => {
    server.use(
      http.post('/api/v1/invitations', () =>
        refusal(409, {
          message:
            'That address has already been invited. Resend the invitation instead.',
          code: 'already_invited',
          details: { invitationId: 'inv-9' },
        }),
      ),
    );
    const onChanged = vi.fn();
    const user = userEvent.setup();
    // Another Admin invited the address after this page read Invited.
    renderWithAuth(
      <Members next={[invitation({ id: 'inv-9' })]} onChanged={onChanged} />,
    );

    await send(user, 'Send invitation');
    expect(
      await screen.findByRole('button', { name: 'Resend instead' }),
    ).toBeVisible();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('says the server’s words when the lists still lack what a refusal names', async () => {
    server.use(
      http.post('/api/v1/invitations', () =>
        refusal(409, {
          message:
            'That address already belongs to a member of this organization. To give them other access, change their roles instead.',
          code: 'already_a_member',
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithAuth(<Members />);

    await send(user, 'Send invitation');
    expect(
      await screen.findByText(
        'That address already belongs to a member of this organization. To give them other access, change their roles instead.',
      ),
    ).toBeVisible();
  });

  it('offers an Admin no Resend on an Owner’s invitation, and says why', async () => {
    server.use(
      http.post('/api/v1/invitations', () =>
        refusal(409, {
          message: 'That address has already been invited.',
          code: 'already_invited',
          details: { invitationId: 'inv-9' },
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithAuth(
      <Members
        roles={ADMINS_ROLES}
        invitations={[invitation({ id: 'inv-9', roles: [roleRef('Owner')] })]}
      />,
    );

    // None chosen to start with, since the organization has made a role.
    await user.click(screen.getByRole('checkbox', { name: 'Viewer' }));
    await send(user, 'Send invitation');
    expect(
      await screen.findByText(
        'It’s an invitation to join as Owner, which only an Owner can resend.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Resend instead' }),
    ).not.toBeInTheDocument();
  });

  it('never says the link was copied when the clipboard refused it', async () => {
    server.use(
      http.post('/api/v1/invitations', () =>
        HttpResponse.json(
          {
            invitation: invitation({
              link: { status: 'copied', lastDay: '2026-10-26' },
            }),
            link: 'https://app.example.com/invitation?token=abc',
          },
          { status: 201 },
        ),
      ),
    );
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new Error('Not allowed'),
    );
    renderWithAuth(<Members />);

    await send(user, 'Copy link');
    expect(
      await screen.findByRole('dialog', { name: 'Your invitation link' }),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Copy the link below and paste it into a message to the person you’re inviting.',
      ),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: 'Invitation link' }),
      ).toHaveValue('https://app.example.com/invitation?token=abc'),
    );
  });

  it('says a link copied before no longer works, when it copies another', () => {
    renderWithAuth(
      <Members
        start={{
          kind: 'copied',
          invitation: invitation({
            link: { status: 'copied', lastDay: '2026-10-26' },
          }),
          link: 'https://app.example.com/invitation?token=def',
          replaces: 'copied',
          copied: true,
        }}
      />,
    );

    expect(
      screen.getByText(
        'The link copied before no longer works. Copying a new link later stops this one working.',
      ),
    ).toBeVisible();
  });

  it('starts on Viewer until the organization has made a role, then on none', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithAuth(<Members />);
    expect(screen.getByRole('checkbox', { name: 'Viewer' })).toBeChecked();
    unmount();

    let sent = false;
    server.use(
      http.post('/api/v1/invitations', () => {
        sent = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    renderWithAuth(<Members roles={[...ROLES, FINANCE]} />);
    for (const name of ['Owner', 'Admin', 'Viewer', 'Finance']) {
      expect(screen.getByRole('checkbox', { name })).not.toBeChecked();
    }

    await send(user, 'Send invitation');
    expect(
      screen.getByRole('group', { name: 'Roles' }),
    ).toHaveAccessibleDescription('Choose at least one role.');
    expect(sent).toBe(false);
  });

  it('sends every role chosen, Owner standing alone', async () => {
    let body: unknown;
    server.use(
      http.post('/api/v1/invitations', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { invitation: invitation(), link: null },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    renderWithAuth(<Members roles={[...ROLES, FINANCE]} />);

    await user.click(screen.getByRole('checkbox', { name: 'Owner' }));
    await user.click(screen.getByRole('checkbox', { name: 'Finance' }));
    expect(screen.getByRole('checkbox', { name: 'Owner' })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Viewer' }));
    await send(user, 'Send invitation');

    await waitFor(() =>
      expect(body).toMatchObject({ roleIds: ['role-finance', 'role-viewer'] }),
    );
  });

  it('disables a role the inviter cannot give, with the reason', () => {
    renderWithAuth(<Members roles={ADMINS_ROLES} />);

    const owner = screen.getByRole('checkbox', { name: 'Owner' });
    expect(owner).toBeDisabled();
    expect(owner).toHaveAccessibleDescription(
      'An Owner holds no other role. Only an Owner can invite an Owner.',
    );
    const finance = screen.getByRole('checkbox', { name: 'Finance' });
    expect(finance).toBeDisabled();
    expect(finance).toHaveAccessibleDescription(
      'Invoices from draft to issued. Your roles don’t include everything Finance can do, so you can’t give it. An Owner can.',
    );
  });

  it('offers no Resend on an invitation naming a role the inviter cannot give', async () => {
    server.use(
      http.post('/api/v1/invitations', () =>
        refusal(409, {
          message: 'That address has already been invited.',
          code: 'already_invited',
          details: { invitationId: 'inv-9' },
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithAuth(
      <Members
        roles={ADMINS_ROLES}
        invitations={[
          invitation({
            id: 'inv-9',
            roles: [{ id: 'role-finance', name: 'Finance', builtIn: false }],
          }),
        ]}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Viewer' }));
    await send(user, 'Send invitation');
    expect(
      await screen.findByText(
        'Your roles don’t include everything Finance can do, so you can’t resend this invitation.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Resend instead' }),
    ).not.toBeInTheDocument();
  });
});

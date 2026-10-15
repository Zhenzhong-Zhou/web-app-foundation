import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import type { Member } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { useAuth } from '../auth/use-auth';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { PasswordField } from '../components/password-field';
import { api, download, hasCode, messageFor } from '../lib/api';
import { formatDay } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import { useSubmit } from '../lib/use-submit';
import { PASSWORD_MAX_LENGTH } from '../lib/validation';
import { CloseOrganizationDialog } from '../settings/close-organization-dialog';

/**
 * The refusal, and the way past it (ADR-069): both blocks are settled on
 * the Members page, by making another member Owner.
 */
function Refusal({ error, code }: { error: string; code: string | null }) {
  const intl = useIntl();
  const can = useCan();
  const settledOnMembers =
    hasCode(code, 'only_member') || hasCode(code, 'last_owner_with_members');
  // The other way past being alone, as the refusal says (ADR-070).
  const canClose = hasCode(code, 'only_member') && can('organizations.delete');

  return (
    <FormError message={error}>
      {settledOnMembers && (
        <Link component={RouterLink} to="/members">
          {intl.formatMessage({
            id: 'account.leave.goToMembers',
            defaultMessage: 'Go to Members',
          })}
        </Link>
      )}
      {canClose && (
        <>
          {' · '}
          <Link component={RouterLink} to="/settings/organization">
            {intl.formatMessage({
              id: 'account.leave.closeOrganization',
              defaultMessage: 'Close the organization',
            })}
          </Link>
        </>
      )}
    </FormError>
  );
}

/**
 * Your data and your account (ADR-069): a copy of what is yours, leaving
 * the organization you are working in, and deleting the account, which
 * waits 30 days before it happens.
 *
 * `onChanged` is called whenever one of its dialogs closes, done or not,
 * so the page can read again what they may have written (#122).
 */
export function LeaveOrDelete({ onChanged }: { onChanged?: () => void }) {
  const intl = useIntl();
  const navigate = useNavigate();
  const { session, refresh } = useAuth();
  const can = useCan();
  const [dialog, setDialog] = useState<'leave' | 'delete' | 'both' | null>(
    null,
  );
  const [password, setPassword] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);
  const leaving = useSubmit(async () => {
    close();
    await refresh();
    void navigate('/');
  });
  const deleting = useSubmit(async () => {
    close();
    await refresh();
  });

  if (!session) return null;
  const organization = session.organization;
  const due = session.user.deletionScheduledAt;

  /**
   * The only member of an organization deletes it with their account, in
   * one step (ADR-070); anyone else deletes the account alone. Only an
   * Owner can be alone in one, and an Owner can list the members.
   */
  async function askToDelete() {
    // Already going alone, it cannot take the account with it: the
    // account's own deletion is the one to ask for (ADR-070).
    if (
      organization &&
      !organization.deletionScheduledAt &&
      can('users.view')
    ) {
      try {
        const members = await api<Member[]>('/users');
        if (members.length === 1) {
          setDialog('both');
          return;
        }
      } catch {
        // Unknown: the account's own dialog, whose refusal says what to do.
      }
    }
    setDialog('delete');
  }

  function close() {
    setDialog(null);
    setPassword('');
    leaving.reset();
    deleting.reset();
    onChanged?.();
  }

  async function exportData() {
    setExportError(null);
    try {
      await download('/account/export');
    } catch (caught) {
      setExportError(messageFor(caught));
    }
  }

  function requestDeletion(event: SubmitEvent) {
    event.preventDefault();
    void deleting.submit(() =>
      api('/account/deletion', {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
    );
  }

  const deleteAccount = intl.formatMessage({
    id: 'account.deletion.delete',
    defaultMessage: 'Delete my account',
  });

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h6" component="h2">
          {intl.formatMessage({
            id: 'account.ending.title',
            defaultMessage: 'Your data and your account',
          })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage({
            id: 'account.ending.intro',
            defaultMessage:
              'Download a copy of what is yours, leave the organization you are working in, or delete your account.',
          })}
        </Typography>
      </Box>

      {exportError && <Alert severity="error">{exportError}</Alert>}
      {due && (
        <Alert severity="warning">
          {intl.formatMessage(
            {
              id: 'account.deletion.pending',
              defaultMessage:
                'Your account will be deleted after {date}. Keep it from the banner at the top of any page.',
            },
            { date: formatDay(due) },
          )}
        </Alert>
      )}

      {organization && can('organizations.export') && (
        // Your data here; the company's records are elsewhere, and an
        // Owner looking for them here should be told where (ADR-070).
        <Typography variant="body2">
          {intl.formatMessage(
            {
              id: 'account.export.organization',
              defaultMessage:
                'This is your own data. Everything {organization} holds is downloaded from <link>Settings → Organization</link>.',
            },
            {
              organization: organization.name,
              link: (chunks) => (
                <Link
                  underline="always"
                  component={RouterLink}
                  to="/settings/organization"
                >
                  {chunks}
                </Link>
              ),
            },
          )}
        </Typography>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button variant="outlined" onClick={() => void exportData()}>
          {intl.formatMessage({
            id: 'account.export.download',
            defaultMessage: 'Download your data',
          })}
        </Button>
        {organization && (
          <Button
            variant="outlined"
            onClick={openDialog(() => setDialog('leave'))}
          >
            {intl.formatMessage(
              {
                id: 'account.leave.button',
                defaultMessage: 'Leave {organization}',
              },
              { organization: organization.name },
            )}
          </Button>
        )}
        {!due && (
          <Button
            variant="outlined"
            color="error"
            onClick={openDialog(() => void askToDelete())}
          >
            {deleteAccount}
          </Button>
        )}
      </Stack>

      <Dialog
        open={dialog === 'leave'}
        onClose={leaving.submitting ? undefined : close}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {intl.formatMessage(
            {
              id: 'account.leave.title',
              defaultMessage: 'Leave {organization}?',
            },
            { organization: organization?.name ?? '' },
          )}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography>
              {intl.formatMessage(
                {
                  id: 'account.leave.explain',
                  defaultMessage:
                    'You lose access to {organization} straight away. Your account stays, your work there keeps your name, and an Owner can add you again.',
                },
                { organization: organization?.name ?? '' },
              )}
            </Typography>
            {leaving.error && (
              <Refusal error={leaving.error} code={leaving.errorCode} />
            )}
          </Stack>
        </DialogContent>
        <DialogFooter
          submitting={leaving.submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'account.leave.confirm',
            defaultMessage: 'Leave',
          })}
          pendingLabel={intl.formatMessage({
            id: 'account.leave.pending',
            defaultMessage: 'Leaving…',
          })}
          destructive
          onConfirm={() =>
            void leaving.submit(() =>
              api('/account/membership', { method: 'DELETE' }),
            )
          }
        />
      </Dialog>

      <CloseOrganizationDialog
        open={dialog === 'both'}
        alone
        onClose={() => {
          setDialog(null);
          onChanged?.();
        }}
        onScheduled={() => undefined}
      />

      <Dialog
        open={dialog === 'delete'}
        onClose={deleting.submitting ? undefined : close}
        fullWidth
        maxWidth="sm"
      >
        <form onSubmit={(event) => void requestDeletion(event)}>
          <DialogTitle>
            {intl.formatMessage({
              id: 'account.deletion.title',
              defaultMessage: 'Delete your account?',
            })}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2}>
              <Typography>
                {intl.formatMessage({
                  id: 'account.deletion.explain.when',
                  defaultMessage:
                    'Your account will be deleted 30 days from now. Until then you can sign in and work as usual, and keep your account from the banner on every page.',
                })}
              </Typography>
              <Typography>
                {intl.formatMessage({
                  id: 'account.deletion.explain.what',
                  defaultMessage:
                    'Then your name, email, photo and history are removed. What you did in each organization stays, under Deleted User. Every other device is signed out now, and you will get an email with the date.',
                })}
              </Typography>
              <Typography color="text.secondary">
                {intl.formatMessage({
                  id: 'account.deletion.explain.copy',
                  defaultMessage:
                    'Want a copy first? Download your data before you go.',
                })}
              </Typography>
              {deleting.error && (
                <Refusal error={deleting.error} code={deleting.errorCode} />
              )}
              <PasswordField
                id="deletionPassword"
                label={intl.formatMessage({
                  id: 'account.deletion.password',
                  defaultMessage: 'Your password',
                })}
                autoComplete="current-password"
                required
                fullWidth
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                slotProps={{ htmlInput: { maxLength: PASSWORD_MAX_LENGTH } }}
              />
            </Stack>
          </DialogContent>
          <DialogFooter
            submitting={deleting.submitting}
            onCancel={close}
            label={deleteAccount}
            pendingLabel={intl.formatMessage({
              id: 'account.deletion.confirming',
              defaultMessage: 'Confirming…',
            })}
            disabled={password.length === 0}
            destructive
          />
        </form>
      </Dialog>
    </Stack>
  );
}

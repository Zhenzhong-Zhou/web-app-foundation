import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/use-auth';
import { PasswordField } from '../components/password-field';
import { api, ApiError, download, hasCode, messageFor } from '../lib/api';
import { formatDate } from '../lib/format';
import { PASSWORD_MAX_LENGTH } from '../lib/validation';

interface Refusal {
  message: string;
  code: string | null;
}

function refusalOf(caught: unknown): Refusal {
  return {
    message: messageFor(caught),
    code: caught instanceof ApiError ? (caught.code ?? null) : null,
  };
}

/**
 * The refusal, and the way past it (ADR-069): both blocks are settled on
 * the Members page, by making another member Owner.
 */
function RefusalAlert({ refusal }: { refusal: Refusal }) {
  const intl = useIntl();
  const settledOnMembers =
    hasCode(refusal.code, 'only_member') ||
    hasCode(refusal.code, 'last_owner_with_members');

  return (
    <Alert severity="error">
      {refusal.message}
      {settledOnMembers && (
        <>
          {' '}
          <Link component={RouterLink} to="/members">
            {intl.formatMessage({
              id: 'account.leave.goToMembers',
              defaultMessage: 'Go to Members',
            })}
          </Link>
        </>
      )}
    </Alert>
  );
}

/**
 * Your data and your account (ADR-069): a copy of what is yours, leaving
 * the organization you are working in, and deleting the account, which
 * waits 30 days before it happens.
 */
export function LeaveOrDelete() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { session, refresh } = useAuth();
  const [dialog, setDialog] = useState<'leave' | 'delete' | null>(null);
  const [password, setPassword] = useState('');
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  if (!session) return null;
  const organization = session.organization;
  const due = session.user.deletionScheduledAt;

  function close() {
    setDialog(null);
    setPassword('');
    setRefusal(null);
  }

  async function exportData() {
    setExportError(null);
    try {
      await download('/account/export');
    } catch (caught) {
      setExportError(messageFor(caught));
    }
  }

  async function leave() {
    setBusy(true);
    setRefusal(null);
    try {
      await api('/account/membership', { method: 'DELETE' });
      close();
      await refresh();
      void navigate('/');
    } catch (caught) {
      setRefusal(refusalOf(caught));
    } finally {
      setBusy(false);
    }
  }

  async function requestDeletion(event: SubmitEvent) {
    event.preventDefault();
    setBusy(true);
    setRefusal(null);
    try {
      await api('/account/deletion', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      close();
      await refresh();
    } catch (caught) {
      setRefusal(refusalOf(caught));
    } finally {
      setBusy(false);
    }
  }

  const cancel = intl.formatMessage({
    id: 'common.cancel',
    defaultMessage: 'Cancel',
  });
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
                'Your account will be deleted on {date}. Keep it from the banner at the top of any page.',
            },
            { date: formatDate(due) },
          )}
        </Alert>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button variant="outlined" onClick={() => void exportData()}>
          {intl.formatMessage({
            id: 'account.export.download',
            defaultMessage: 'Download your data',
          })}
        </Button>
        {organization && (
          <Button variant="outlined" onClick={() => setDialog('leave')}>
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
            onClick={() => setDialog('delete')}
          >
            {deleteAccount}
          </Button>
        )}
      </Stack>

      <Dialog open={dialog === 'leave'} onClose={close} fullWidth maxWidth="sm">
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
            {refusal && <RefusalAlert refusal={refusal} />}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>{cancel}</Button>
          <Button
            color="error"
            variant="contained"
            disabled={busy}
            onClick={() => void leave()}
          >
            {intl.formatMessage({
              id: 'account.leave.confirm',
              defaultMessage: 'Leave',
            })}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={dialog === 'delete'}
        onClose={close}
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
              {refusal && <RefusalAlert refusal={refusal} />}
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
          <DialogActions>
            <Button onClick={close}>{cancel}</Button>
            <Button
              type="submit"
              color="error"
              variant="contained"
              disabled={busy || password.length === 0}
            >
              {deleteAccount}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Stack>
  );
}

import DownloadIcon from '@mui/icons-material/Download';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type ReactNode, type SubmitEvent, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

import type { OrganizationProfile } from '../api/types.gen';
import { useAuth } from '../auth/use-auth';
import { DialogFooter } from '../components/dialog-footer';
import { ForgottenPasswordHint } from '../components/forgotten-password-hint';
import { FormError } from '../components/form-error';
import { PasswordField } from '../components/password-field';
import { api, ApiError, apiUrl, hasCode } from '../lib/api';
import { formatWhen } from '../lib/format';
import { useSubmit } from '../lib/use-submit';
import { PASSWORD_MAX_LENGTH } from '../lib/validation';
import {
  dayWithDaysLeft,
  DELETION_DAYS,
  deletionDayFrom,
  EXPORT_PATH,
  exportedBy,
} from './organization-deletion';

/** How often the dialog asks whether a download it started has finished. */
const POLL_MS = 3000;
/** And for how long, before it waits for the window's focus instead. */
const POLL_FOR_MS = 10 * 60 * 1000;

/**
 * Closing an organization (ADR-070): keep the records first, type its name,
 * and confirm with the password. For the only member (`alone`), the same
 * steps delete the organization and then their account, in one step.
 *
 * The export downloads as a plain link, straight to disk: it can approach
 * 1 GB. A page cannot tell when such a download ends, so the dialog asks
 * the server for the last export, which it records before the download
 * ends: when the window regains focus, and every few seconds after the
 * link is followed.
 */
export function CloseOrganizationDialog({
  open,
  alone,
  onClose,
  onScheduled,
}: {
  open: boolean;
  /** The only member: the account goes with it (ADR-070). */
  alone: boolean;
  onClose: () => void;
  onScheduled: () => void | Promise<void>;
}) {
  const intl = useIntl();
  const { session, refresh } = useAuth();
  const [organization, setOrganization] = useState<OrganizationProfile | null>(
    null,
  );
  const [downloadedAt, setDownloadedAt] = useState<number | null>(null);
  // Bumped when the server finds the export older than the day, so the
  // dialog reads it again and offers the download and the decline.
  const [readAgain, setReadAgain] = useState(0);
  const [declined, setDeclined] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const scheduling = useSubmit(async () => {
    close();
    await Promise.all([refresh(), onScheduled()]);
  });

  // The organization as it is now, read again while the dialog is open.
  useEffect(() => {
    if (!open) return;
    let ignore = false;
    let polling: number | undefined;
    let stopping: number | undefined;
    const stopPolling = () => window.clearInterval(polling);
    const read = () =>
      void api<{ organization: OrganizationProfile }>('/organization').then(
        (response) => {
          if (ignore) return;
          setOrganization(response.organization);
          // The download it followed is recorded: nothing left to wait for.
          if (response.organization.lastExport?.fresh) stopPolling();
        },
        () => undefined,
      );

    read();
    window.addEventListener('focus', read);
    if (downloadedAt !== null) {
      polling = window.setInterval(read, POLL_MS);
      stopping = window.setTimeout(stopPolling, POLL_FOR_MS);
    }
    return () => {
      ignore = true;
      window.removeEventListener('focus', read);
      window.clearInterval(polling);
      window.clearTimeout(stopping);
    };
  }, [open, downloadedAt, readAgain]);

  function close() {
    setDeclined(false);
    setName('');
    setPassword('');
    setDownloadedAt(null);
    scheduling.reset();
    onClose();
  }

  const last = organization?.lastExport ?? null;
  // The server's answer, by its clock: the deletion relies on the same.
  const fresh = last?.fresh ?? false;
  const exportDone = fresh || declined;
  const nameMatches =
    organization !== null && name.trim() === organization.name.trim();
  const missing = [
    !exportDone &&
      intl.formatMessage({
        id: 'settings.deletion.missing.export',
        defaultMessage: 'the download, or “I don’t need a copy”',
      }),
    !nameMatches &&
      intl.formatMessage({
        id: 'settings.deletion.missing.name',
        defaultMessage: 'the name',
      }),
    password.length === 0 &&
      intl.formatMessage({
        id: 'settings.deletion.missing.password',
        defaultMessage: 'your password',
      }),
  ].filter((part): part is string => part !== false);

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (missing.length > 0 || !organization) return;
    void scheduling.submit(async () => {
      try {
        await api('/organization/deletion', {
          method: 'POST',
          body: JSON.stringify({
            organizationName: name,
            password,
            declineExport: !fresh && declined,
            deleteAccount: alone,
          }),
        });
      } catch (error) {
        // The day passed since the dialog read it: read it again, so the
        // step offers the download and the decline instead of a green tick.
        if (
          error instanceof ApiError &&
          hasCode(error.code ?? null, 'organization_export_required')
        ) {
          setReadAgain((count) => count + 1);
        }
        throw error;
      }
    });
  }

  // The password was refused (#120): marked on its field, and tied to the
  // refusal that says what to do.
  const wrongPassword = hasCode(scheduling.errorCode, 'password_incorrect');
  const organizationName = organization?.name ?? session?.organization?.name;
  // Thirty days ahead by definition: counted from the browser's own day, an
  // evening west of UTC would read "in 31 days" (ADR-069's day is UTC).
  const day = dayWithDaysLeft(intl, deletionDayFrom(new Date()), DELETION_DAYS);
  const who = last ? exportedBy(intl, last, session?.user.id) : null;
  const confirmLabel = alone
    ? intl.formatMessage({
        id: 'settings.deletion.confirmBoth',
        defaultMessage: 'Delete both',
      })
    : intl.formatMessage({
        id: 'settings.deletion.confirm',
        defaultMessage: 'Close organization',
      });

  return (
    <Dialog
      open={open}
      onClose={scheduling.submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={submit}>
        <DialogTitle>
          {alone
            ? intl.formatMessage(
                {
                  id: 'settings.deletion.titleBoth',
                  defaultMessage: 'Delete your account and {organization}?',
                },
                { organization: organizationName },
              )
            : intl.formatMessage(
                {
                  id: 'settings.deletion.title',
                  defaultMessage: 'Close {organization}?',
                },
                { organization: organizationName },
              )}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            {alone ? (
              <>
                <Typography>
                  {intl.formatMessage(
                    {
                      id: 'settings.deletion.both.when',
                      defaultMessage:
                        'You’re the only member of {organization}, so it goes with your account, in one step. After {day} the organization and every record in it are deleted first, then your account, the same day.',
                    },
                    { organization: organizationName, day },
                  )}
                </Typography>
                <Typography>
                  {intl.formatMessage({
                    id: 'settings.deletion.both.until',
                    defaultMessage:
                      'Until then you can sign in and work as usual. Once you confirm, every other device is signed out, and you’ll get an email with the date, and another 7 days before. To keep both, press Keep both in the banner at the top of every page.',
                  })}
                </Typography>
              </>
            ) : (
              <>
                <Typography>
                  {intl.formatMessage(
                    {
                      id: 'settings.deletion.when',
                      defaultMessage:
                        'It will be deleted after {day}, with every record in it: orders, stock, invoices and credit notes, files and the audit log. Until then everyone can keep working as usual. Only an Owner can cancel, until that day is over.',
                    },
                    { day },
                  )}
                </Typography>
                <Typography>
                  {intl.formatMessage({
                    id: 'settings.deletion.members',
                    defaultMessage:
                      'Members keep their accounts and lose only this membership. Everyone is emailed now, 7 days before, if it’s cancelled, and when it’s done.',
                  })}
                </Typography>
              </>
            )}

            <Step
              title={intl.formatMessage({
                id: 'settings.deletion.step.records',
                defaultMessage: '1. Keep your records',
              })}
            >
              <Typography variant="body2">
                {intl.formatMessage({
                  id: 'settings.deletion.records.why',
                  defaultMessage:
                    'Tax law expects your business to keep its books, often for six years or more. Download everything as one ZIP: a spreadsheet file for every kind of record, and your uploaded files.',
                })}
              </Typography>
              {last?.fresh ? (
                <Typography
                  role="status"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    color: 'success.main',
                    fontWeight: 600,
                  }}
                >
                  <TaskAltIcon fontSize="small" aria-hidden />
                  {intl.formatMessage(
                    {
                      id: 'settings.deletion.downloaded',
                      defaultMessage: 'Downloaded {when}, by {who}',
                    },
                    { when: formatWhen(last.exportedAt), who },
                  )}
                </Typography>
              ) : (
                <>
                  {downloadedAt !== null && (
                    <Typography role="status" variant="body2">
                      {intl.formatMessage({
                        id: 'settings.deletion.downloading',
                        defaultMessage:
                          'Downloading… The time of the download appears here once it has finished.',
                      })}
                    </Typography>
                  )}
                  {last && downloadedAt === null && (
                    <Typography variant="body2" color="warning.dark">
                      {intl.formatMessage(
                        {
                          id: 'settings.deletion.stale',
                          defaultMessage:
                            'Last downloaded {when} by {who}. That’s more than a day old, so download again.',
                        },
                        {
                          when: formatWhen(last.exportedAt),
                          who,
                        },
                      )}
                    </Typography>
                  )}
                  <Box>
                    <Button
                      variant="outlined"
                      startIcon={<DownloadIcon />}
                      href={apiUrl(EXPORT_PATH)}
                      download
                      onClick={() => setDownloadedAt(Date.now())}
                    >
                      {intl.formatMessage({
                        id: 'settings.deletion.download',
                        defaultMessage: 'Download everything (ZIP)',
                      })}
                    </Button>
                  </Box>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={declined}
                        onChange={(event) => setDeclined(event.target.checked)}
                      />
                    }
                    label={
                      <>
                        {intl.formatMessage({
                          id: 'settings.deletion.decline',
                          defaultMessage: 'I don’t need a copy',
                        })}
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          component="span"
                          sx={{ display: 'block' }}
                        >
                          {intl.formatMessage({
                            id: 'settings.deletion.decline.why',
                            defaultMessage:
                              'Your records can’t be recovered once the organization is deleted.',
                          })}
                        </Typography>
                      </>
                    }
                    sx={{ alignItems: 'flex-start' }}
                  />
                </>
              )}
            </Step>

            <Step
              title={intl.formatMessage(
                {
                  id: 'settings.deletion.step.name',
                  defaultMessage: '2. Type {organization} to confirm',
                },
                { organization: organizationName },
              )}
            >
              <TextField
                id="closeOrganizationName"
                label={intl.formatMessage({
                  id: 'settings.deletion.name',
                  defaultMessage: 'Organization name',
                })}
                autoComplete="off"
                fullWidth
                value={name}
                onChange={(event) => setName(event.target.value)}
                // Typed but not the same: say so, rather than listing the
                // name as still needed as though nothing were typed.
                error={name.trim() !== '' && !nameMatches}
                helperText={
                  name.trim() !== '' && !nameMatches
                    ? intl.formatMessage({
                        id: 'settings.deletion.nameMismatch',
                        defaultMessage:
                          'Not the same as the name. Capital and small letters count.',
                      })
                    : undefined
                }
              />
            </Step>

            <Step
              title={intl.formatMessage({
                id: 'settings.deletion.step.password',
                defaultMessage: '3. Your password',
              })}
            >
              <PasswordField
                id="closeOrganizationPassword"
                label={intl.formatMessage({
                  id: 'account.deletion.password',
                  defaultMessage: 'Your password',
                })}
                autoComplete="current-password"
                fullWidth
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={wrongPassword}
                slotProps={{
                  htmlInput: {
                    maxLength: PASSWORD_MAX_LENGTH,
                    'aria-describedby': wrongPassword
                      ? 'close-organization-error'
                      : undefined,
                  },
                }}
              />
            </Step>

            {scheduling.error && (
              <FormError
                id="close-organization-error"
                message={scheduling.error}
              >
                {wrongPassword && <ForgottenPasswordHint />}
                {hasCode(
                  scheduling.errorCode,
                  'organization_export_required',
                ) &&
                  intl.formatMessage({
                    id: 'settings.deletion.exportAgain',
                    defaultMessage:
                      'The last download is more than a day old now: download again, then confirm.',
                  })}
              </FormError>
            )}
          </Stack>
        </DialogContent>
        {missing.length > 0 && (
          <Typography
            id="close-organization-missing"
            role="status"
            variant="body2"
            color="text.secondary"
            sx={{ px: 3, textAlign: 'right' }}
          >
            {intl.formatMessage(
              {
                id: 'settings.deletion.stillNeeded',
                defaultMessage: 'Still needed: {parts}.',
              },
              { parts: intl.formatList(missing, { type: 'conjunction' }) },
            )}
          </Typography>
        )}
        <DialogFooter
          submitting={scheduling.submitting}
          onCancel={close}
          label={confirmLabel}
          pendingLabel={intl.formatMessage({
            id: 'account.deletion.confirming',
            defaultMessage: 'Confirming…',
          })}
          disabled={missing.length > 0}
          describedBy={
            missing.length > 0 ? 'close-organization-missing' : undefined
          }
          destructive
        />
      </form>
    </Dialog>
  );
}

/** One numbered step of the dialog, in its own outline. */
function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
        {children}
      </Stack>
    </Paper>
  );
}

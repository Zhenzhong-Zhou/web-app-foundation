import CheckCircle from '@mui/icons-material/CheckCircle';
import Close from '@mui/icons-material/Close';
import LinkIcon from '@mui/icons-material/Link';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormLabel,
  IconButton,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { type SubmitEvent, useEffect, useId, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import type {
  CopiedInvitationLink,
  CreatedInvitation,
  Invitation,
  InvitationEnvelope,
  Member,
  Role,
} from '../api/types.gen';
import { useAuth } from '../auth/use-auth';
import { FormError } from '../components/form-error';
import { useToast } from '../components/use-toast';
import { useLanguage } from '../i18n/use-language';
import { api, hasCode } from '../lib/api';
import { formatDayLong } from '../lib/format';
import { isLocale, pickerName, SUPPORTED_LOCALES } from '../lib/locales';
import { useSubmit } from '../lib/use-submit';
import { EMAIL_MAX_LENGTH } from '../lib/validation';
import { rem } from '../theme/rem';
import {
  alreadyInvitedLabel,
  dailyLimitLabel,
  refusalLabel,
} from './invitation-words';
import {
  copyToClipboard,
  type InviteView,
  NOTE_MAX_LENGTH,
} from './invite-view';
import { articleOf, roleDescription, roleLabel, roleList } from './role-names';

/**
 * Invite someone (ADR-077): an address, a role described by what it lets a
 * person do, the language to write to them in and an optional note; then
 * the link emailed, or copied for the inviter to send. Each refusal shows
 * where it applies, keyed on its code, never on its words. On a phone the
 * dialog takes the screen. Mounted afresh for each opening (its key), so
 * it starts where `start` says, the form empty.
 */
export function InviteDialog({
  open,
  start,
  roles,
  members,
  invitations,
  isOwner,
  onClose,
  onChanged,
}: {
  open: boolean;
  /** The state to open in: the form, or a row's copied link or failed send. */
  start: InviteView;
  roles: Role[];
  members: Member[];
  invitations: Invitation[];
  isOwner: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const titleId = useId();

  const [view, setView] = useState<InviteView>(start);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      fullScreen={phone}
      aria-labelledby={titleId}
    >
      {view.kind === 'form' && (
        <InviteForm
          titleId={titleId}
          phone={phone}
          roles={roles}
          members={members}
          invitations={invitations}
          isOwner={isOwner}
          onClose={onClose}
          onChanged={onChanged}
          onView={setView}
        />
      )}
      {view.kind === 'copied' && (
        <LinkCopied
          titleId={titleId}
          phone={phone}
          view={view}
          onClose={onClose}
        />
      )}
      {view.kind === 'notSent' && (
        <NotSent
          titleId={titleId}
          phone={phone}
          invitation={view.invitation}
          onClose={onClose}
          onChanged={onChanged}
          onView={setView}
        />
      )}
    </Dialog>
  );
}

/** The dialog's title, with a close button before it on a phone. */
function Title({
  id,
  phone,
  onClose,
  children,
}: {
  id: string;
  phone: boolean;
  onClose: () => void;
  children: string;
}) {
  const intl = useIntl();
  return (
    <DialogTitle
      id={id}
      sx={
        phone
          ? {
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              pl: 1,
              borderBottom: 1,
              borderColor: 'divider',
            }
          : undefined
      }
    >
      {phone && (
        <IconButton
          onClick={onClose}
          aria-label={intl.formatMessage({
            id: 'common.close',
            defaultMessage: 'Close',
          })}
        >
          <Close />
        </IconButton>
      )}
      {children}
    </DialogTitle>
  );
}

function InviteForm({
  titleId,
  phone,
  roles,
  members,
  invitations,
  isOwner,
  onClose,
  onChanged,
  onView,
}: {
  titleId: string;
  phone: boolean;
  roles: Role[];
  members: Member[];
  invitations: Invitation[];
  isOwner: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onView: (view: InviteView) => void;
}) {
  const intl = useIntl();
  const toast = useToast();
  const { session } = useAuth();
  const { locale: pageLocale } = useLanguage();
  const id = useId();
  const emailProblemId = `${id}-email-problem`;
  const noteHelpId = `${id}-note-help`;

  const viewer = roles.find((role) => role.name === 'Viewer');
  const [email, setEmail] = useState('');
  // The least access, raised on purpose (ADR-077).
  const [roleId, setRoleId] = useState(viewer?.id ?? roles[0]?.id ?? '');
  // The inviter's own language, unless they choose another.
  const [locale, setLocale] = useState(
    isLocale(session?.user.locale) ? session.user.locale : pageLocale,
  );
  const [note, setNote] = useState('');
  const made = useRef<{ result: CreatedInvitation; copied: boolean } | null>(
    null,
  );

  const organizationName = session?.organization?.name ?? '';

  const { submitting, error, errorCode, errorDetails, reset, submit } =
    useSubmit<CreatedInvitation>(async () => {
      if (!made.current) return;
      const { result, copied } = made.current;
      await onChanged();
      if (result.link) {
        onView({
          kind: 'copied',
          invitation: result.invitation,
          link: result.link,
          replaces: null,
          copied,
        });
      } else if (result.invitation.link.status === 'notSent') {
        onView({ kind: 'notSent', invitation: result.invitation });
      } else {
        toast(
          intl.formatMessage(
            {
              id: 'members.invite.sent',
              defaultMessage: 'Invitation sent to {email}',
            },
            { email: result.invitation.email },
          ),
        );
        onClose();
      }
    });

  function send(delivery: 'email' | 'link') {
    void submit(async () => {
      const result = await api<CreatedInvitation>('/invitations', {
        method: 'POST',
        body: JSON.stringify({
          email,
          // One until the dialog offers several (ADR-080).
          roleIds: [roleId],
          locale,
          note: note.trim() || null,
          delivery,
        }),
      });
      // Onto the clipboard at once, before the lists are read again: a
      // browser lets a page write to it only so long after the click.
      made.current = {
        result,
        copied: result.link ? await copyToClipboard(result.link) : false,
      };
      return result;
    });
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    send('email');
  }

  // Each refusal where it applies (conventions.md, "Error codes").
  const typed = email.trim().toLowerCase();
  const member = hasCode(errorCode, 'already_a_member')
    ? members.find((each) => each.email.toLowerCase() === typed)
    : undefined;
  const invited = hasCode(errorCode, 'already_invited')
    ? invitations.find((each) => each.id === errorDetails?.invitationId)
    : undefined;
  const emailProblem = member
    ? intl.formatMessage(
        {
          id: 'members.invite.alreadyMember',
          defaultMessage:
            '{name} is already a member here, as {system, select, Owner {an {roles}} Admin {an {roles}} Viewer {a {roles}} other {{roles}}}.',
        },
        {
          name: member.name,
          roles: roleList(member.roles),
          system: articleOf(member.roles),
        },
      )
    : invited
      ? alreadyInvitedLabel(invited, session?.user.id, intl)
      : null;
  const unverified = hasCode(errorCode, 'email_unverified');
  const limit =
    hasCode(errorCode, 'invitations_daily_limit') && errorDetails?.at
      ? dailyLimitLabel(organizationName, errorDetails.at, intl)
      : null;
  // A refusal shown in place says it there; anything else, above.
  const placed = emailProblem !== null || unverified || limit !== null;
  // A member or an invitation these lists have not caught up with: read
  // again, so the refusal is said in place, with Resend. Until then, and
  // should they still not show it, the server's own words stand above.
  const behind =
    (hasCode(errorCode, 'already_a_member') && !member) ||
    (hasCode(errorCode, 'already_invited') && !invited);
  useEffect(() => {
    if (behind) void onChanged();
  }, [behind, onChanged]);
  // An Owner's invitation is an Owner's to resend (ADR-077), as Invited
  // shows it.
  const ownersInvitation =
    invited !== undefined &&
    !isOwner &&
    invited.roles.some((role) => role.builtIn && role.name === 'Owner');

  const resent = useRef<Invitation | null>(null);
  const resend = useSubmit(async () => {
    const invitation = resent.current;
    await onChanged();
    if (invitation?.link.status === 'notSent') {
      onView({ kind: 'notSent', invitation });
      return;
    }
    toast(
      intl.formatMessage(
        {
          id: 'members.invited.resent',
          defaultMessage: 'Invitation sent again to {email}',
        },
        { email: invitation?.email ?? '' },
      ),
    );
    onClose();
  });

  const confirmation = useSubmit(async () => undefined, {
    success: intl.formatMessage(
      {
        id: 'members.invite.confirmationSent',
        defaultMessage: 'Confirmation sent to {email}',
      },
      { email: session?.user.email ?? '' },
    ),
  });

  function close() {
    reset();
    onClose();
  }

  const copyLabel = intl.formatMessage({
    id: 'members.invite.copyLink',
    defaultMessage: 'Copy link',
  });
  const sendLabel = intl.formatMessage({
    id: 'members.invite.send',
    defaultMessage: 'Send invitation',
  });

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}
    >
      <Title id={titleId} phone={phone} onClose={close}>
        {intl.formatMessage(
          {
            id: 'members.invite.title',
            defaultMessage: 'Invite someone to {organization}',
          },
          { organization: organizationName },
        )}
      </Title>

      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && !placed && <FormError message={error} />}

          {unverified && (
            <Alert
              severity="warning"
              action={
                <Button
                  color="inherit"
                  size="small"
                  disabled={confirmation.submitting}
                  onClick={() =>
                    void confirmation.submit(() =>
                      api('/auth/verify-email/resend', { method: 'POST' }),
                    )
                  }
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  {intl.formatMessage({
                    id: 'members.invite.resendConfirmation',
                    defaultMessage: 'Resend confirmation',
                  })}
                </Button>
              }
            >
              {intl.formatMessage(
                {
                  id: 'members.invite.unverified',
                  defaultMessage:
                    'Confirm your own email first. Invitations go out in your name, so we need to know {email} is yours.',
                },
                { email: session?.user.email ?? '' },
              )}
            </Alert>
          )}
          {limit && <Alert severity="warning">{limit}</Alert>}

          <Stack spacing={1}>
            <TextField
              id={`${id}-email`}
              label={intl.formatMessage({
                id: 'auth.field.email',
                defaultMessage: 'Email',
              })}
              type="email"
              required
              fullWidth
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={emailProblem !== null}
              helperText={
                emailProblem && <span id={emailProblemId}>{emailProblem}</span>
              }
              slotProps={{
                htmlInput: {
                  maxLength: EMAIL_MAX_LENGTH,
                  inputMode: 'email',
                  'aria-describedby': emailProblem ? emailProblemId : undefined,
                },
              }}
            />
            {invited && !ownersInvitation && (
              <Button
                variant="outlined"
                sx={{ alignSelf: 'flex-start' }}
                disabled={resend.submitting}
                onClick={() =>
                  void resend.submit(async () => {
                    const { invitation } = await api<InvitationEnvelope>(
                      `/invitations/${invited.id}/resend`,
                      { method: 'POST' },
                    );
                    resent.current = invitation;
                  })
                }
              >
                {intl.formatMessage({
                  id: 'members.invite.resendInstead',
                  defaultMessage: 'Resend instead',
                })}
              </Button>
            )}
            {ownersInvitation && (
              <Typography variant="body2" color="text.secondary">
                {intl.formatMessage({
                  id: 'members.invite.ownersInvitation',
                  defaultMessage:
                    'It’s an invitation to join as Owner, which only an Owner can resend.',
                })}
              </Typography>
            )}
            {resend.error && (
              <FormError
                message={refusalLabel(
                  {
                    message: resend.error,
                    code: resend.errorCode,
                    details: resend.errorDetails,
                  },
                  organizationName,
                  intl,
                )}
              />
            )}
          </Stack>

          <RoleCards
            roles={roles}
            value={roleId}
            isOwner={isOwner}
            onChange={setRoleId}
          />

          <TextField
            id={`${id}-language`}
            select
            label={intl.formatMessage({
              id: 'members.invite.language',
              defaultMessage: 'Write to them in',
            })}
            value={locale}
            onChange={(event) => {
              if (isLocale(event.target.value)) setLocale(event.target.value);
            }}
            sx={{ maxWidth: { sm: rem(260) } }}
          >
            {SUPPORTED_LOCALES.map((each) => (
              <MenuItem key={each} value={each} lang={each}>
                {pickerName(each)}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            id={`${id}-note`}
            label={intl.formatMessage({
              id: 'members.invite.note',
              defaultMessage: 'A note from you (optional)',
            })}
            multiline
            minRows={3}
            fullWidth
            value={note}
            onChange={(event) => setNote(event.target.value)}
            helperText={
              <Box
                component="span"
                id={noteHelpId}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 2,
                }}
              >
                <span>
                  {intl.formatMessage({
                    id: 'members.invite.note.help',
                    defaultMessage:
                      'In the email, and on the page where they accept.',
                  })}
                </span>
                <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
                  {intl.formatMessage(
                    {
                      id: 'members.invite.note.count',
                      defaultMessage: '{count} / {max}',
                    },
                    { count: note.length, max: NOTE_MAX_LENGTH },
                  )}
                </Box>
              </Box>
            }
            slotProps={{
              htmlInput: {
                maxLength: NOTE_MAX_LENGTH,
                'aria-describedby': noteHelpId,
              },
            }}
          />
        </Stack>
      </DialogContent>

      {phone ? (
        // A phone's buttons stack at the foot, the main one first.
        <Stack spacing={1.25} sx={{ p: 2, mt: 'auto' }}>
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={submitting}
          >
            {sendLabel}
          </Button>
          <Button
            variant="outlined"
            size="large"
            startIcon={<LinkIcon />}
            disabled={submitting}
            onClick={() => send('link')}
          >
            {copyLabel}
          </Button>
        </Stack>
      ) : (
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button variant="text" onClick={close} disabled={submitting}>
            {intl.formatMessage({
              id: 'common.cancel',
              defaultMessage: 'Cancel',
            })}
          </Button>
          <Button
            variant="outlined"
            startIcon={<LinkIcon />}
            disabled={submitting}
            onClick={() => send('link')}
          >
            {copyLabel}
          </Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {sendLabel}
          </Button>
        </DialogActions>
      )}
    </Box>
  );
}

/**
 * The roles as cards, each with what it lets a person do (ADR-077). An
 * Admin sees Owner disabled, with the reason in its place.
 */
function RoleCards({
  roles,
  value,
  isOwner,
  onChange,
}: {
  roles: Role[];
  value: string;
  isOwner: boolean;
  onChange: (roleId: string) => void;
}) {
  const intl = useIntl();
  const id = useId();
  const legendId = `${id}-legend`;

  return (
    <Box component="fieldset" sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
      <FormLabel
        component="legend"
        id={legendId}
        sx={{ fontWeight: 600, color: 'text.primary', mb: 1 }}
      >
        {intl.formatMessage({ id: 'members.role', defaultMessage: 'Role' })}
      </FormLabel>
      <RadioGroup
        aria-labelledby={legendId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        sx={{ gap: 1 }}
      >
        {roles.map((role) => {
          const locked = role.name === 'Owner' && !isOwner;
          const lineId = `${id}-${role.id}`;
          const line = locked
            ? intl.formatMessage({
                id: 'members.invite.ownerOnly',
                defaultMessage: 'Only an Owner can invite an Owner.',
              })
            : roleDescription(role.name);
          const chosen = role.id === value;
          return (
            <FormControlLabel
              key={role.id}
              value={role.id}
              disabled={locked}
              control={
                <Radio
                  slotProps={{
                    input: { 'aria-describedby': line ? lineId : undefined },
                  }}
                />
              }
              label={
                <Box component="span" sx={{ display: 'block', py: 0.5 }}>
                  <Box component="span" sx={{ fontWeight: 600 }}>
                    {roleLabel(role.name)}
                  </Box>
                  {line && (
                    <Typography
                      component="span"
                      id={lineId}
                      variant="body2"
                      color="text.secondary"
                      sx={{ display: 'block' }}
                    >
                      {line}
                    </Typography>
                  )}
                </Box>
              }
              sx={{
                m: 0,
                alignItems: 'flex-start',
                border: chosen ? 2 : 1,
                borderColor: chosen ? 'primary.main' : 'divider',
                // The accent, lightly, as a chosen card is drawn (ADR-055).
                bgcolor: chosen ? 'surface.chosen' : undefined,
                borderRadius: 1,
                // Two pixels of border chosen, one otherwise: the text stays put.
                px: chosen ? 1.25 : 1.375,
                py: chosen ? 0.375 : 0.5,
                '& .MuiRadio-root': { mt: 0.25 },
              }}
            />
          );
        })}
      </RadioGroup>
    </Box>
  );
}

/**
 * The link, copied, for the inviter to send themselves: once on the
 * clipboard, and in a field to copy again.
 */
function LinkCopied({
  titleId,
  phone,
  view,
  onClose,
}: {
  titleId: string;
  phone: boolean;
  view: Extract<InviteView, { kind: 'copied' }>;
  onClose: () => void;
}) {
  const intl = useIntl();
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  // A page without the clipboard's permission is told to copy the field
  // itself, never that it was copied, and the field is ready selected.
  const [copied, setCopied] = useState(view.copied);
  useEffect(() => {
    if (!view.copied) field.current?.select();
  }, [view.copied]);

  async function copy() {
    const done = await copyToClipboard(view.link);
    setCopied(done);
    if (!done) field.current?.select();
  }

  const { invitation } = view;

  return (
    <>
      <Title id={titleId} phone={phone} onClose={onClose}>
        {copied
          ? intl.formatMessage({
              id: 'members.invite.copied.title',
              defaultMessage: 'Link copied',
            })
          : intl.formatMessage({
              id: 'members.invite.copied.titleManual',
              defaultMessage: 'Your invitation link',
            })}
      </Title>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {
            <Box
              role="status"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                fontWeight: 600,
                color: copied ? 'success.main' : 'text.primary',
              }}
            >
              {copied && <CheckCircle fontSize="small" aria-hidden />}
              {copied
                ? intl.formatMessage({
                    id: 'members.invite.copied.done',
                    defaultMessage:
                      'Copied. Paste it into a message to the person you’re inviting.',
                  })
                : intl.formatMessage({
                    id: 'members.invite.copied.manual',
                    defaultMessage:
                      'Copy the link below and paste it into a message to the person you’re inviting.',
                  })}
            </Box>
          }
          <Stack direction="row" spacing={1}>
            <TextField
              id={`${id}-link`}
              label={intl.formatMessage({
                id: 'members.invite.copied.link',
                defaultMessage: 'Invitation link',
              })}
              value={view.link}
              fullWidth
              inputRef={field}
              slotProps={{ htmlInput: { readOnly: true } }}
            />
            <Button
              variant="outlined"
              onClick={() => void copy()}
              sx={{ whiteSpace: 'nowrap', flex: 'none' }}
            >
              {intl.formatMessage({
                id: 'members.invite.copied.again',
                defaultMessage: 'Copy again',
              })}
            </Button>
          </Stack>
          <Typography>
            {intl.formatMessage(
              {
                id: 'members.invite.copied.works',
                defaultMessage:
                  'It works once, until {date}. Send it only to them: whoever opens it first joins as {email}, {system, select, Owner {an {roles}} Admin {an {roles}} Viewer {a {roles}} other {{roles}}}.',
              },
              {
                date: invitation.link.lastDay
                  ? formatDayLong(invitation.link.lastDay)
                  : '',
                email: invitation.email,
                roles: roleList(invitation.roles),
                system: articleOf(invitation.roles),
              },
            )}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {view.replaces === 'emailed'
              ? intl.formatMessage({
                  id: 'members.invite.copied.replacesEmailed',
                  defaultMessage:
                    'The link in the email no longer works. Copying a new link later stops this one working.',
                })
              : view.replaces === 'copied'
                ? intl.formatMessage({
                    id: 'members.invite.copied.replacesCopied',
                    defaultMessage:
                      'The link copied before no longer works. Copying a new link later stops this one working.',
                  })
                : intl.formatMessage({
                    id: 'members.invite.copied.noEmail',
                    defaultMessage:
                      'No email was sent. Copying a new link later stops this one working.',
                  })}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={phone ? { p: 2 } : undefined}>
        <Button variant="contained" onClick={onClose} fullWidth={phone}>
          {intl.formatMessage({
            id: 'members.invite.done',
            defaultMessage: 'Done',
          })}
        </Button>
      </DialogActions>
    </>
  );
}

/**
 * The email did not go (ADR-077): the invitation is kept, its link spent,
 * and the ways on are its link, copied, or another try.
 */
function NotSent({
  titleId,
  phone,
  invitation,
  onClose,
  onChanged,
  onView,
}: {
  titleId: string;
  phone: boolean;
  invitation: Invitation;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onView: (view: InviteView) => void;
}) {
  const intl = useIntl();
  const toast = useToast();
  const { session } = useAuth();
  // Tries again that also failed: each says so, so Try again is seen to
  // have done something.
  const [retries, setRetries] = useState(0);
  const outcome = useRef<
    | { kind: 'resent'; invitation: Invitation }
    | { kind: 'copied'; link: CopiedInvitationLink; copied: boolean }
    | null
  >(null);

  const { submitting, error, errorCode, errorDetails, submit } = useSubmit(
    async () => {
      const done = outcome.current;
      await onChanged();
      if (done?.kind === 'copied') {
        onView({
          kind: 'copied',
          invitation: done.link.invitation,
          link: done.link.link,
          replaces: null,
          copied: done.copied,
        });
      } else if (done?.invitation.link.status === 'notSent') {
        setRetries((count) => count + 1);
      } else {
        toast(
          intl.formatMessage(
            {
              id: 'members.invited.resent',
              defaultMessage: 'Invitation sent again to {email}',
            },
            { email: invitation.email },
          ),
        );
        onClose();
      }
    },
  );

  return (
    <>
      <Title id={titleId} phone={phone} onClose={onClose}>
        {intl.formatMessage({
          id: 'members.invite.notSent.title',
          defaultMessage: 'Couldn’t send the email',
        })}
      </Title>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && (
            <FormError
              message={refusalLabel(
                { message: error, code: errorCode, details: errorDetails },
                session?.organization?.name ?? '',
                intl,
              )}
            />
          )}
          {/* Mounted afresh on each failed try, so it is read out again. */}
          <Alert key={`not-sent-${retries}`} severity="warning">
            {retries === 0
              ? intl.formatMessage(
                  {
                    id: 'members.invite.notSent.alert',
                    defaultMessage:
                      'We couldn’t send the invitation email to {email}.',
                  },
                  { email: invitation.email },
                )
              : intl.formatMessage(
                  {
                    id: 'members.invite.notSent.again',
                    defaultMessage:
                      'We tried {count, plural, one {again} other {# more times}} and still couldn’t send the invitation email to {email}.',
                  },
                  { count: retries, email: invitation.email },
                )}
          </Alert>
          <Typography>
            {intl.formatMessage({
              id: 'members.invite.notSent.body',
              defaultMessage:
                'The invitation is ready. Copy its link and send it yourself, or try again in a few minutes.',
            })}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions
        sx={{ flexWrap: 'wrap', gap: 1, p: phone ? 2 : undefined }}
      >
        <Button variant="text" onClick={onClose} disabled={submitting}>
          {intl.formatMessage({ id: 'common.close', defaultMessage: 'Close' })}
        </Button>
        <Button
          variant="outlined"
          disabled={submitting}
          onClick={() =>
            void submit(async () => {
              const { invitation: next } = await api<InvitationEnvelope>(
                `/invitations/${invitation.id}/resend`,
                { method: 'POST' },
              );
              outcome.current = { kind: 'resent', invitation: next };
            })
          }
        >
          {intl.formatMessage({
            id: 'common.tryAgain',
            defaultMessage: 'Try again',
          })}
        </Button>
        <Button
          variant="contained"
          startIcon={<LinkIcon />}
          disabled={submitting}
          onClick={() =>
            void submit(async () => {
              const link = await api<CopiedInvitationLink>(
                `/invitations/${invitation.id}/link`,
                { method: 'POST' },
              );
              // Onto the clipboard at once, as Invite's own Copy link does.
              outcome.current = {
                kind: 'copied',
                link,
                copied: await copyToClipboard(link.link),
              };
            })
          }
        >
          {intl.formatMessage({
            id: 'members.invite.copyLink',
            defaultMessage: 'Copy link',
          })}
        </Button>
      </DialogActions>
    </>
  );
}

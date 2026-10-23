import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useId, useRef, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import {
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';

import { AccessList } from '../account/access-list';
import {
  type Area,
  AREA_LABELS,
  AREAS,
  permissionsIn,
} from '../account/access-phrases';
import type {
  CataloguePermission,
  Permission,
  Role,
  RoleCatalogue,
  RoleDetail,
} from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { FormError } from '../components/form-error';
import { PageHeader } from '../components/page-header';
import { UnsavedChangesDialog } from '../components/unsaved-changes-dialog';
import { LoadFailure } from '../errors/load-failure';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import { GoHome } from '../errors/status-actions';
import { StatusPage } from '../errors/status-page';
import { api, hasCode } from '../lib/api';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { useSubmit } from '../lib/use-submit';
import { useUnsavedChanges } from '../lib/use-unsaved-changes';
import {
  ROLE_DESCRIPTION_MAX_LENGTH,
  ROLE_NAME_MAX_LENGTH,
} from '../lib/validation';
import { rem } from '../theme/rem';
import { PermissionArea } from './permission-area';
import { lockedIn, offered, startingWith, tick, untick } from './role-grants';
import { nameOf, ROLE_WORDS, useQuoted } from './role-words';
import { type Start, StartFrom } from './start-from';

const WORDS = defineMessages({
  name: { id: 'roles.editor.name', defaultMessage: 'Name' },
  nameHelp: {
    id: 'roles.editor.name.help',
    defaultMessage:
      'Shown as you write it, in every language. Name it in the language your team reads.',
  },
  line: {
    id: 'roles.editor.line',
    defaultMessage: 'What it is for (optional)',
  },
  summaryNote: {
    id: 'roles.editor.summary.note',
    defaultMessage: 'As its holders will read it on Your access.',
  },
  owners: {
    id: 'roles.editor.owners',
    defaultMessage:
      'Making and changing roles, and closing the organization, stay with Owners.',
  },
  save: { id: 'roles.editor.save', defaultMessage: 'Save role' },
  saving: { id: 'roles.editor.saving', defaultMessage: 'Saving…' },
  cancel: { id: 'common.cancel', defaultMessage: 'Cancel' },
  keepEditing: {
    id: 'roles.editor.keepEditing',
    defaultMessage: 'Keep editing',
  },
  reload: { id: 'roles.editor.reload', defaultMessage: 'Reload' },
  ownersOnly: {
    id: 'roles.editor.ownersOnly.title',
    defaultMessage: 'Only Owners make and change roles',
  },
  ownersOnlyMessage: {
    id: 'roles.editor.ownersOnly.message',
    defaultMessage:
      'Your roles don’t include making or changing roles. An Owner of your organization can.',
  },
});

/** Settings → Roles → Make a role: from a template, a copy or nothing. */
export function NewRolePage() {
  const can = useCan();
  const [params] = useSearchParams();
  const catalogue = useResource<RoleCatalogue>('/roles/catalogue');
  const roles = useResource<Role[]>('/roles');

  if (!can('roles.create')) return <OwnersOnly />;
  const refused = catalogue.refused ?? roles.refused;
  if (refused) {
    return (
      <RevisionRefusalPage
        failure={refused}
        onRetry={() => {
          void catalogue.reload();
          void roles.reload();
        }}
      />
    );
  }
  const failed = catalogue.error ?? roles.error;
  if (failed) return <Alert severity="error">{failed}</Alert>;
  if (!catalogue.data || !roles.data) return <Waiting />;
  return (
    <RoleEditor
      catalogue={catalogue.data}
      roles={roles.data}
      editing={null}
      copyId={params.get('copy')}
    />
  );
}

/**
 * A made role's editor. A built-in role is never edited (ADR-080), so its
 * address leads to its page, where Make a copy is.
 */
export function EditRolePage() {
  const intl = useIntl();
  const can = useCan();
  const { id = '' } = useParams();
  const catalogue = useResource<RoleCatalogue>('/roles/catalogue');
  const role = useResource<RoleDetail>(`/roles/${id}`);
  // Read again after someone else's save: the editor starts again from it.
  const [version, setVersion] = useState(0);

  if (!can('roles.update')) return <OwnersOnly />;
  if (role.error) {
    return (
      <LoadFailure
        failure={role.failure}
        message={role.error}
        missingTitle={intl.formatMessage({
          id: 'status.missing.role',
          defaultMessage: "This role doesn't exist",
        })}
        list={{
          to: '/settings/roles',
          label: intl.formatMessage(ROLE_WORDS.roles),
        }}
        onRetry={() => void role.reload()}
      />
    );
  }
  if (catalogue.error) {
    return <Alert severity="error">{catalogue.error}</Alert>;
  }
  if (!catalogue.data || !role.data) return <Waiting />;
  if (role.data.builtIn) {
    return <Navigate to={`/settings/roles/${role.data.id}`} replace />;
  }
  return (
    <RoleEditor
      key={`role-${version}`}
      catalogue={catalogue.data}
      // Start from, which alone reads the roles, is for making one.
      roles={[]}
      editing={role.data}
      copyId={null}
      onReload={async () => {
        await role.reload();
        setVersion((count) => count + 1);
      }}
    />
  );
}

function Waiting() {
  const show = useDelayedFlag(true);
  return show ? <Skeleton variant="rounded" height={480} /> : null;
}

/** The editor's address, opened by someone who may not use it. */
function OwnersOnly() {
  const intl = useIntl();
  return (
    <StatusPage
      kind="forbidden"
      title={intl.formatMessage(WORDS.ownersOnly)}
      message={intl.formatMessage(WORDS.ownersOnlyMessage)}
      actions={<GoHome primary />}
    />
  );
}

/** Which areas open: those with a box ticked beyond the three locked. */
function openAreas(
  catalogue: readonly CataloguePermission[],
  granted: ReadonlySet<Permission>,
): Set<Area> {
  const locked = lockedIn(catalogue);
  return new Set(
    AREAS.filter((area) =>
      permissionsIn(area).some((key) => granted.has(key) && !locked.has(key)),
    ),
  );
}

function areaOf(key: Permission): Area | undefined {
  return AREAS.find((area) => permissionsIn(area).includes(key));
}

/**
 * The role editor (ADR-080), a page of its own: Start from first, when a
 * role is made; its name and line; the eight areas of boxes, each with
 * its line, what it needs and who is told through it; and beside them on
 * a computer, below them on a phone, what the role can do in the words its
 * holders will read on Your access, following each tick. A box's needs
 * are ticked with it and its dependants unticked with it, and the status
 * line says what else changed. Leaving with changes not saved asks first;
 * a save made after someone else's is refused, naming them, with Reload.
 */
function RoleEditor({
  catalogue,
  roles,
  editing,
  copyId: initialCopyId,
  onReload,
}: {
  catalogue: RoleCatalogue;
  roles: Role[];
  editing: RoleDetail | null;
  copyId: string | null;
  onReload?: () => Promise<void>;
}) {
  const intl = useIntl();
  const navigate = useNavigate();
  const quoted = useQuoted();
  const id = useId();
  const permissions = catalogue.permissions;
  const lineOf = (key: Permission) =>
    quoted(permissions.find((each) => each.key === key)?.line ?? key);

  // The name a copy is offered, until one is typed.
  const copyName = (role: Role) =>
    intl.formatMessage(
      { id: 'roles.editor.copyName', defaultMessage: '{role} (copy)' },
      { role: nameOf(role) },
    );

  const copied = roles.find((role) => role.id === initialCopyId);
  const [initial] = useState(() => ({
    name: editing ? editing.name : copied ? copyName(copied) : '',
    description: editing?.description ?? '',
    granted: editing
      ? new Set(editing.permissions)
      : startingWith(permissions, copied?.permissions ?? []),
  }));
  const [start, setStart] = useState<Start | null>(copied ? 'copy' : null);
  const [copyId, setCopyId] = useState(copied?.id ?? '');
  const [name, setName] = useState(initial.name);
  const [nameTyped, setNameTyped] = useState(false);
  const [description, setDescription] = useState(initial.description);
  const [granted, setGranted] = useState<Set<Permission>>(initial.granted);
  const [open, setOpen] = useState(() => openAreas(permissions, granted));
  const [status, setStatus] = useState('');
  const saved = useRef<RoleDetail | null>(null);

  const dirty =
    name !== initial.name ||
    description !== initial.description ||
    granted.size !== initial.granted.size ||
    [...granted].some((key) => !initial.granted.has(key));
  const { blocker, release } = useUnsavedChanges(dirty);

  const shownName = name.trim();
  const { submitting, error, errorCode, reset, submit } = useSubmit<RoleDetail>(
    () => {
      const role = saved.current;
      if (!role) return;
      release();
      // In the editor's place, so Back does not return to a saved form.
      void navigate(`/settings/roles/${role.id}`, { replace: true });
    },
    {
      success: (role) =>
        editing
          ? intl.formatMessage(
              { id: 'roles.editor.saved', defaultMessage: '{role} saved' },
              { role: role.name },
            )
          : intl.formatMessage(
              { id: 'roles.editor.made', defaultMessage: '{role} made' },
              { role: role.name },
            ),
    },
  );
  const nameProblem = hasCode(errorCode, 'role_name_unavailable')
    ? error
    : null;
  const stale = hasCode(errorCode, 'role_changed');

  /** A start chosen: its boxes ticked, its name offered if none typed. */
  function startFrom(next: Start, fromCopy = copyId) {
    setStart(next);
    const template = catalogue.templates.find((each) => each.key === next);
    const copy =
      next === 'copy' ? roles.find((role) => role.id === fromCopy) : undefined;
    if (next === 'copy' && !copy) return;
    const ticked = startingWith(
      permissions,
      template?.permissions ?? copy?.permissions ?? [],
    );
    setGranted(ticked);
    setOpen(openAreas(permissions, ticked));
    setStatus('');
    if (!nameTyped) {
      setName(template ? template.name : copy ? copyName(copy) : '');
    }
  }

  function apply(
    change: { granted: Set<Permission>; also: Permission[] },
    words: string,
  ) {
    setGranted(change.granted);
    setStatus(change.also.length > 0 ? words : '');
    // What else was ticked is opened, so it is seen as well as said.
    if (change.also.some((key) => change.granted.has(key))) {
      setOpen((current) => {
        const next = new Set(current);
        for (const key of change.also) {
          const area = areaOf(key);
          if (area && change.granted.has(key)) next.add(area);
        }
        return next;
      });
    }
  }

  function toggle(key: Permission, ticked: boolean) {
    const change = ticked
      ? tick(permissions, granted, [key])
      : untick(permissions, granted, [key]);
    const lines = intl.formatList(change.also.map(lineOf));
    apply(
      change,
      ticked
        ? intl.formatMessage(
            {
              id: 'roles.editor.alsoTicked',
              defaultMessage: 'Also ticked {lines}, which {line} needs.',
            },
            { lines, line: lineOf(key) },
          )
        : intl.formatMessage(
            {
              id: 'roles.editor.alsoUnticked',
              defaultMessage:
                '{count, plural, one {Also unticked {lines}, which needs {line}.} other {Also unticked {lines}, which need {line}.}}',
            },
            {
              count: change.also.length,
              lines,
              line: lineOf(key),
            },
          ),
    );
  }

  function wholeArea(area: Area, ticked: boolean) {
    const keys = permissionsIn(area).filter((key) => offered(permissions, key));
    const change = ticked
      ? tick(permissions, granted, keys)
      : untick(permissions, granted, keys);
    const values = {
      count: change.also.length,
      lines: intl.formatList(change.also.map(lineOf)),
      area: intl.formatMessage(AREA_LABELS[area]),
    };
    apply(
      change,
      ticked
        ? intl.formatMessage(
            {
              id: 'roles.editor.alsoTickedArea',
              defaultMessage: 'Also ticked {lines}, which {area} needs.',
            },
            values,
          )
        : intl.formatMessage(
            {
              id: 'roles.editor.alsoUntickedArea',
              defaultMessage:
                '{count, plural, one {Also unticked {lines}, which needs something in {area}.} other {Also unticked {lines}, which need something in {area}.}}',
            },
            values,
          ),
    );
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(async () => {
      const body = {
        name: shownName,
        description: description.trim() || null,
        permissions: permissions
          .map((each) => each.key)
          .filter((key) => granted.has(key)),
      };
      const role = await api<RoleDetail>(
        editing ? `/roles/${editing.id}` : '/roles',
        {
          method: editing ? 'PATCH' : 'POST',
          body: JSON.stringify(
            editing ? { ...body, updatedAt: editing.updatedAt } : body,
          ),
        },
      );
      saved.current = role;
      return role;
    });
  }

  const title = editing
    ? intl.formatMessage(
        { id: 'roles.editor.editTitle', defaultMessage: 'Edit {role}' },
        { role: editing.name },
      )
    : intl.formatMessage(ROLE_WORDS.makeRole);
  const summaryTitle = intl.formatMessage(
    {
      id: 'roles.editor.summary',
      defaultMessage:
        '{named, select, yes {What {role} can do} other {What this role can do}}',
    },
    {
      named: shownName ? 'yes' : 'no',
      role: shownName,
    },
  );

  const summary = (
    <Stack spacing={1}>
      <Typography variant="h6" component="h2" id={`${id}-summary`}>
        {summaryTitle}
      </Typography>
      <AccessList permissions={[...granted]} stacked />
      <Typography variant="body2" color="text.secondary">
        {intl.formatMessage(WORDS.summaryNote)}
      </Typography>
    </Stack>
  );

  const buttons = (
    <Stack spacing={1.5}>
      {error && !nameProblem && !stale && <FormError message={error} />}
      <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
        <Button type="submit" disabled={submitting}>
          {intl.formatMessage(submitting ? WORDS.saving : WORDS.save)}
        </Button>
        <Button
          variant="text"
          disabled={submitting}
          onClick={() => {
            release();
            void navigate(
              editing ? `/settings/roles/${editing.id}` : '/settings/roles',
            );
          }}
        >
          {intl.formatMessage(WORDS.cancel)}
        </Button>
      </Stack>
    </Stack>
  );

  return (
    <Stack component="form" spacing={3} onSubmit={handleSubmit}>
      <PageHeader
        crumbs={[
          {
            label: intl.formatMessage(ROLE_WORDS.roles),
            to: '/settings/roles',
          },
          ...(editing
            ? [{ label: editing.name, to: `/settings/roles/${editing.id}` }]
            : []),
        ]}
        title={title}
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            md: `minmax(0, 1fr) ${rem(340)}`,
          },
          gap: 3,
          alignItems: 'start',
        }}
      >
        <Stack spacing={2.5} sx={{ minWidth: 0 }}>
          {!editing && (
            <StartFrom
              templates={catalogue.templates}
              roles={roles}
              value={start}
              copyId={copyId}
              onChange={(next) => startFrom(next)}
              onCopy={(roleId) => {
                setCopyId(roleId);
                startFrom('copy', roleId);
              }}
            />
          )}

          <TextField
            id={`${id}-name`}
            label={intl.formatMessage(WORDS.name)}
            required
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameTyped(true);
            }}
            error={nameProblem !== null}
            helperText={nameProblem ?? intl.formatMessage(WORDS.nameHelp)}
            slotProps={{ htmlInput: { maxLength: ROLE_NAME_MAX_LENGTH } }}
            sx={{ maxWidth: { sm: rem(480) } }}
          />
          <TextField
            id={`${id}-line`}
            label={intl.formatMessage(WORDS.line)}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            helperText={intl.formatMessage(
              { id: 'roles.editor.count', defaultMessage: '{count} / {max}' },
              {
                count: description.length,
                max: ROLE_DESCRIPTION_MAX_LENGTH,
              },
            )}
            slotProps={{
              htmlInput: { maxLength: ROLE_DESCRIPTION_MAX_LENGTH },
            }}
          />

          {/* What else a tick changed, said as it happens. */}
          <Box role="status" aria-live="polite">
            {status && <Alert severity="info">{status}</Alert>}
          </Box>

          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            {AREAS.map((area) => (
              <PermissionArea
                key={area}
                area={area}
                catalogue={permissions}
                granted={granted}
                open={open.has(area)}
                onToggle={() =>
                  setOpen((current) => {
                    const next = new Set(current);
                    if (!next.delete(area)) next.add(area);
                    return next;
                  })
                }
                onChange={toggle}
                onTickAll={() => wholeArea(area, true)}
                onClear={() => wholeArea(area, false)}
              />
            ))}
          </Box>
          <Typography variant="body2" color="text.secondary">
            {intl.formatMessage(WORDS.owners)}
          </Typography>
        </Stack>

        {/* Beside the boxes on a computer, held in view as they scroll;
            below them on a phone, then the buttons. */}
        <Paper
          variant="outlined"
          component="aside"
          aria-labelledby={`${id}-summary`}
          sx={{
            p: 2.5,
            position: { md: 'sticky' },
            top: { md: 88 },
          }}
        >
          <Stack spacing={2.5}>
            {summary}
            {buttons}
          </Stack>
        </Paper>
      </Box>

      <ChangedDialog
        open={stale}
        title={intl.formatMessage(
          {
            id: 'roles.editor.changed.title',
            defaultMessage: '{role} was changed',
          },
          {
            role: editing?.name ?? '',
          },
        )}
        message={error ?? ''}
        // The changes stay; saving them is refused again until Reload.
        onKeepEditing={reset}
        onReload={() => {
          reset();
          release();
          void onReload?.();
        }}
      />
      <UnsavedChangesDialog
        blocker={blocker}
        message={intl.formatMessage(
          {
            id: 'roles.editor.unsaved',
            defaultMessage:
              '{named, select, yes {Your changes to {role} aren’t saved yet.} other {The role you’re making isn’t saved yet.}}',
          },
          {
            named: editing ? 'yes' : 'no',
            role: editing?.name ?? '',
          },
        )}
      />
    </Stack>
  );
}

/**
 * A save refused because someone else saved the role first (ADR-080,
 * `role_changed`): their name, and Reload to start again from theirs.
 */
function ChangedDialog({
  open,
  title,
  message,
  onKeepEditing,
  onReload,
}: {
  open: boolean;
  title: string;
  message: string;
  onKeepEditing: () => void;
  onReload: () => void;
}) {
  const intl = useIntl();
  const id = useId();
  return (
    <Dialog
      open={open}
      onClose={onKeepEditing}
      maxWidth="xs"
      fullWidth
      aria-labelledby={`${id}-title`}
    >
      <DialogTitle id={`${id}-title`}>{title}</DialogTitle>
      <DialogContent>
        <Alert severity="warning" role="note">
          {message}
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onKeepEditing}>
          {intl.formatMessage(WORDS.keepEditing)}
        </Button>
        <Button onClick={onReload}>{intl.formatMessage(WORDS.reload)}</Button>
      </DialogActions>
    </Dialog>
  );
}

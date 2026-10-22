import {
  Alert,
  Box,
  Button,
  Link,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { type ReactNode, useId, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';

import { AccessList } from '../account/access-list';
import {
  Permission,
  type Role,
  type RoleCatalogue,
  type RoleDetail,
} from '../api/types.gen';
import { HistoryButton } from '../audit/history-button';
import { useCan } from '../auth/permissions';
import { PageHeader } from '../components/page-header';
import { PersonAvatar } from '../components/person-avatar';
import { LoadFailure } from '../errors/load-failure';
import { openDialog } from '../lib/open-dialog';
import { EMAIL_MAX_WIDTH } from '../lib/text-limits';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { DeleteRoleDialog } from './delete-role-dialog';
import { MoveEveryoneDialog } from './move-everyone-dialog';
import { RoleChips } from './role-chips';
import { kindLabel, nameOf, ROLE_WORDS } from './role-words';

const EVERYTHING = Object.values(Permission);

/**
 * A role's page (ADR-080), as other detail pages: what it can do, in the
 * sentences its holders read on Your access (ADR-079), whom it tells of
 * what, and who holds it. Make a copy on every role's page, built in too;
 * Edit and Delete for a role made here; Move everyone to… for any, for
 * whoever may change members' roles. Every member may read it.
 */
export function RolePage() {
  const intl = useIntl();
  const can = useCan();
  const navigate = useNavigate();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const { id = '' } = useParams();
  const {
    data: role,
    error,
    failure,
    loading,
    reload,
  } = useResource<RoleDetail>(`/roles/${id}`);
  // Who is told of what, in the catalogue's words; the roles Move offers.
  const { data: catalogue } = useResource<RoleCatalogue>('/roles/catalogue');
  const { data: roles, reload: reloadRoles } = useResource<Role[]>('/roles');
  const showSkeleton = useDelayedFlag(loading);
  const heading = useRef<HTMLHeadingElement>(null);
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!role) {
    return error ? (
      <LoadFailure
        failure={failure}
        message={error}
        missingTitle={intl.formatMessage({
          id: 'status.missing.role',
          defaultMessage: "This role doesn't exist",
        })}
        list={{
          to: '/settings/roles',
          label: intl.formatMessage(ROLE_WORDS.roles),
        }}
        onRetry={() => void reload()}
      />
    ) : showSkeleton ? (
      <Skeleton height={240} />
    ) : null;
  }

  const name = nameOf(role);
  const everything = EVERYTHING.every((key) => role.permissions.includes(key));
  const notes = [
    ...new Set(
      (catalogue?.permissions ?? [])
        .filter((each) => each.note && role.permissions.includes(each.key))
        .map((each) => each.note as string),
    ),
  ];
  const mayMove = can('roles.assign') && role.holderCount > 0;
  const mayGive = can('roles.assign') && role.mayGive;

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[
          {
            label: intl.formatMessage(ROLE_WORDS.roles),
            to: '/settings/roles',
          },
        ]}
        title={name}
        headingRef={heading}
        status={{
          label: kindLabel(role, intl),
          color: role.builtIn ? 'default' : 'info',
        }}
        subtitle={role.description}
        actions={
          <>
            <HistoryButton resourceId={role.id} />
            {!role.builtIn && can('roles.update') && (
              <Button
                variant="text"
                component={RouterLink}
                to={`/settings/roles/${role.id}/edit`}
              >
                {intl.formatMessage({
                  id: 'common.edit',
                  defaultMessage: 'Edit',
                })}
              </Button>
            )}
            {can('roles.create') && (
              <Button
                variant="text"
                component={RouterLink}
                to={`/settings/roles/new?copy=${role.id}`}
              >
                {intl.formatMessage({
                  id: 'roles.copy',
                  defaultMessage: 'Make a copy',
                })}
              </Button>
            )}
            {mayMove && (
              <Button
                variant="text"
                onClick={openDialog(() => setMoving(true))}
              >
                {intl.formatMessage({
                  id: 'roles.move',
                  defaultMessage: 'Move everyone to…',
                })}
              </Button>
            )}
            {!role.builtIn && can('roles.delete') && (
              <Button
                variant="text"
                color="error"
                onClick={openDialog(() => setDeleting(true))}
              >
                {intl.formatMessage({
                  id: 'roles.delete',
                  defaultMessage: 'Delete',
                })}
              </Button>
            )}
          </>
        }
      />

      {error && <Alert severity="error">{error}</Alert>}

      {role.builtIn && (
        <Alert severity="info" role="note">
          {intl.formatMessage(
            {
              id: 'roles.builtIn.note',
              defaultMessage:
                'Built-in roles stay as they are, in every language. To vary {role}, make a copy: it starts with everything {role} has, and you untick what you don’t want.',
            },
            { role: name },
          )}
        </Alert>
      )}

      <Section
        title={intl.formatMessage(
          { id: 'roles.can.title', defaultMessage: 'What {role} can do' },
          { role: name },
        )}
      >
        {everything ? (
          <Typography>
            {intl.formatMessage({
              id: 'roles.can.everything',
              defaultMessage:
                'Everything here, including settings and closing the organization.',
            })}
          </Typography>
        ) : (
          <AccessList permissions={role.permissions} />
        )}
      </Section>

      {/* Three notifications go to whoever holds a permission, so a role
          changes who hears of them (ADR-080). */}
      {catalogue && (
        <Section
          title={intl.formatMessage({
            id: 'roles.told.title',
            defaultMessage: 'Also told',
          })}
        >
          {notes.length > 0 ? (
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {notes.map((note) => (
                <li key={note}>
                  <Typography>{note}</Typography>
                </li>
              ))}
            </Box>
          ) : (
            <Typography color="text.secondary">
              {intl.formatMessage({
                id: 'roles.told.none',
                defaultMessage: 'Nothing from this role.',
              })}
            </Typography>
          )}
        </Section>
      )}

      <Holders role={role} phone={phone} mayGive={mayGive} />

      {mayMove && roles && (
        <MoveEveryoneDialog
          key={moving ? `move-${role.id}` : 'move-closed'}
          open={moving}
          role={role}
          roles={roles}
          onClose={() => setMoving(false)}
          onMoved={async () => {
            await Promise.all([reload(), reloadRoles()]);
            // Nobody holds it now, so Move everyone has gone with its
            // dialog: focus starts where the page does (ADR-080).
            heading.current?.focus();
          }}
        />
      )}

      {!role.builtIn && (
        <DeleteRoleDialog
          key={deleting ? `delete-${role.id}` : 'delete-closed'}
          open={deleting}
          role={role}
          onClose={() => setDeleting(false)}
          onMoveEveryone={
            mayMove
              ? () => {
                  setDeleting(false);
                  setMoving(true);
                }
              : undefined
          }
          onDeleted={() =>
            void navigate('/settings/roles', {
              replace: true,
              state: { focusHeading: true },
            })
          }
        />
      )}
    </Stack>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <Box component="section" aria-labelledby={id}>
      <Stack spacing={1}>
        <Typography variant="h6" component="h2" id={id}>
          {title}
        </Typography>
        {children}
      </Stack>
    </Box>
  );
}

/**
 * Who holds the role, each with every role they hold. Held by nobody, as
 * a role just made is, it says where to give it, to whoever may.
 */
function Holders({
  role,
  phone,
  mayGive,
}: {
  role: RoleDetail;
  phone: boolean;
  mayGive: boolean;
}) {
  const intl = useIntl();
  const headingId = useId();
  const name = nameOf(role);

  const heading = (
    <Typography
      variant="h6"
      component="h2"
      id={headingId}
      sx={phone ? undefined : { px: 2.5, pt: 2, pb: 1.5 }}
    >
      <FormattedMessage
        id="roles.holders.heading"
        defaultMessage="Held by <muted>{count}</muted>"
        values={{
          count: role.holderCount,
          muted: (chunks: ReactNode[]) => (
            <Box
              component="span"
              sx={{ color: 'text.secondary', fontWeight: 400 }}
            >
              {chunks}
            </Box>
          ),
        }}
      />
    </Typography>
  );

  const person = (holder: RoleDetail['holders'][number], size?: number) => (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
      <PersonAvatar
        userId={holder.id}
        name={holder.name}
        email={holder.email}
        photoFileId={holder.photoFileId}
        size={size}
      />
      <Link component={RouterLink} to={`/people/${holder.id}`}>
        {holder.name}
      </Link>
    </Stack>
  );

  if (role.holders.length === 0) {
    return (
      <Box component="section" aria-labelledby={headingId}>
        <Stack spacing={1}>
          <Typography variant="h6" component="h2" id={headingId}>
            {intl.formatMessage({
              id: 'roles.column.heldBy',
              defaultMessage: 'Held by',
            })}
          </Typography>
          <Typography color="text.secondary">
            {intl.formatMessage(
              {
                id: 'roles.holders.none',
                defaultMessage: 'Nobody holds {role}.',
              },
              { role: name },
            )}
            {mayGive && (
              <>
                {' '}
                <FormattedMessage
                  id="roles.holders.give"
                  defaultMessage="Give it to someone on <link>Members</link>."
                  values={{
                    link: (chunks: ReactNode[]) => (
                      <Link
                        component={RouterLink}
                        to="/members"
                        underline="always"
                      >
                        {chunks}
                      </Link>
                    ),
                  }}
                />
              </>
            )}
          </Typography>
        </Stack>
      </Box>
    );
  }

  return phone ? (
    <Stack component="section" aria-labelledby={headingId} spacing={1.25}>
      {heading}
      {role.holders.map((holder) => (
        <Paper
          key={holder.id}
          variant="outlined"
          component="article"
          aria-label={holder.name}
          sx={{ p: 1.75 }}
        >
          <Stack spacing={1}>
            {person(holder, 40)}
            <RoleChips roles={holder.roles} />
          </Stack>
        </Paper>
      ))}
    </Stack>
  ) : (
    <Paper variant="outlined" component="section" aria-labelledby={headingId}>
      {heading}
      <TableContainer>
        <Table aria-labelledby={headingId}>
          <TableHead>
            <TableRow>
              <TableCell>
                {intl.formatMessage({
                  id: 'common.name',
                  defaultMessage: 'Name',
                })}
              </TableCell>
              <TableCell>
                {intl.formatMessage({
                  id: 'auth.field.email',
                  defaultMessage: 'Email',
                })}
              </TableCell>
              <TableCell>
                {intl.formatMessage({
                  id: 'roles.holders.roles',
                  defaultMessage: 'Their roles',
                })}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {role.holders.map((holder) => (
              <TableRow key={holder.id}>
                <TableCell>{person(holder)}</TableCell>
                <TableCell
                  title={holder.email}
                  sx={{
                    maxWidth: EMAIL_MAX_WIDTH,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {holder.email}
                </TableCell>
                <TableCell>
                  <RoleChips roles={holder.roles} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

import MoreVert from '@mui/icons-material/MoreVert';
import {
  Box,
  IconButton,
  Menu,
  MenuItem,
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
import { type ReactNode, useId, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';

import type { Member, Role } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { PersonAvatar } from '../components/person-avatar';
import { formatMoment } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import { EMAIL_MAX_WIDTH } from '../lib/text-limits';
import { activeLabel } from '../people/people-types';
import { RoleChips } from '../roles/role-chips';
import { CannotChangeDialog } from './cannot-change-dialog';
import { ChangeRolesDialog } from './change-roles-dialog';
import { HIDDEN } from './hidden';
import { RemoveMemberDialog } from './remove-member-dialog';
import { mayGiveAll } from './role-names';

type Action = 'change' | 'remove';

/** The dialog a row's menu opened, kept through its closing. */
interface Opened {
  kind: Action | 'refused';
  action: Action;
  member: Member;
  open: boolean;
  /** Mounts it afresh for each opening, from the member's roles. */
  key: number;
}

/**
 * Members' list (ADR-080): each member's roles side by side, a table on a
 * computer and a card each on a phone, and a menu on each row for
 * whoever may change roles or remove members, Change roles and Remove
 * from the organization, never Remove on the reader's own row, since
 * leaving is Account's. Whether the reader may change a member is the
 * server's rule, read from the roles list: their roles must together hold
 * everything the member's do, so each of the member's roles is one they
 * may give. When not, the menu says so before anything is sent.
 */
export function MembersSection({
  members,
  roles,
  selfId,
  organizationName,
  loading,
  showSkeleton,
  onChanged,
  onRemoved,
}: {
  members: Member[] | null;
  roles: readonly Role[];
  selfId: string | undefined;
  organizationName: string;
  loading: boolean;
  showSkeleton: boolean;
  onChanged: () => Promise<void>;
  /** After a member has gone: the page reads its lists again. */
  onRemoved: () => Promise<void>;
}) {
  const intl = useIntl();
  const can = useCan();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const headingId = useId();
  const menuId = useId();

  const [menu, setMenu] = useState<{
    anchor: HTMLElement;
    member: Member;
    open: boolean;
  } | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  // What the menu was closed for, opened once it has gone, so focus is
  // back on its button first and the dialog gives it back there.
  const [pending, setPending] = useState<Action | null>(null);

  const mayChange = (member: Member) => mayGiveAll(roles, member.roles);

  const actionsOf = (member: Member): Action[] => [
    ...(can('roles.assign') ? (['change'] as const) : []),
    ...(can('users.delete') && member.id !== selfId
      ? (['remove'] as const)
      : []),
  ];
  const anyActions = can('roles.assign') || can('users.delete');
  const nameOf = (member: Member) => member.name || member.email;

  function choose(action: Action) {
    setPending(action);
    setMenu((current) => current && { ...current, open: false });
  }

  function handOff() {
    const action = pending;
    setPending(null);
    if (!action || !menu) return;
    const { member, anchor } = menu;
    openDialog(() =>
      setOpened((current) => ({
        kind: mayChange(member) ? action : 'refused',
        action,
        member,
        open: true,
        key: (current?.key ?? 0) + 1,
      })),
    )({ currentTarget: anchor });
  }

  const close = () =>
    setOpened((current) => current && { ...current, open: false });

  const more = (member: Member) =>
    actionsOf(member).length > 0 ? (
      <IconButton
        aria-label={intl.formatMessage(
          { id: 'members.more', defaultMessage: 'More for {name}' },
          { name: nameOf(member) },
        )}
        aria-haspopup="menu"
        aria-expanded={menu?.open === true && menu.member.id === member.id}
        aria-controls={
          menu?.open && menu.member.id === member.id ? menuId : undefined
        }
        onClick={(event) =>
          setMenu({ anchor: event.currentTarget, member, open: true })
        }
      >
        <MoreVert />
      </IconButton>
    ) : null;

  const you = (member: Member) =>
    member.id === selfId && (
      <Typography
        component="span"
        variant="caption"
        color="text.secondary"
        sx={{ ml: 1 }}
      >
        {intl.formatMessage({ id: 'members.you', defaultMessage: 'you' })}
      </Typography>
    );

  const heading = (
    <Typography
      variant="h6"
      component="h2"
      id={headingId}
      sx={phone ? undefined : { px: 2.5, pt: 2, pb: 1.5 }}
    >
      {members ? (
        <FormattedMessage
          id="members.heading"
          defaultMessage="Members <muted>{count}</muted>"
          values={{
            count: members.length,
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
      ) : (
        intl.formatMessage({
          id: 'layout.menu.members',
          defaultMessage: 'Members',
        })
      )}
    </Typography>
  );

  const skeleton = (
    <Stack sx={{ p: phone ? 0 : 2 }} spacing={1}>
      {showSkeleton ? (
        <>
          <Skeleton height={48} />
          <Skeleton height={48} />
        </>
      ) : null}
    </Stack>
  );

  return (
    <Box component="section" aria-labelledby={headingId}>
      {phone ? (
        <Stack spacing={1.25}>
          {heading}
          {loading
            ? skeleton
            : members?.map((member) => (
                <Paper
                  key={member.id}
                  variant="outlined"
                  component="article"
                  aria-label={nameOf(member)}
                  sx={{ p: 1.75 }}
                >
                  <Stack
                    direction="row"
                    spacing={1.5}
                    sx={{ alignItems: 'flex-start' }}
                  >
                    <PersonAvatar
                      userId={member.id}
                      name={member.name}
                      email={member.email}
                      photoFileId={member.photoFileId}
                    />
                    <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
                      <Box>
                        <Typography component="span" sx={{ fontWeight: 600 }}>
                          {member.name}
                        </Typography>
                        {you(member)}
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          title={member.email}
                          sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {member.email}
                        </Typography>
                      </Box>
                      <RoleChips roles={member.roles} />
                    </Stack>
                    {more(member)}
                  </Stack>
                </Paper>
              ))}
        </Stack>
      ) : (
        <Paper variant="outlined">
          {heading}
          {loading ? (
            skeleton
          ) : (
            <TableContainer>
              <Table
                aria-label={intl.formatMessage({
                  id: 'layout.menu.members',
                  defaultMessage: 'Members',
                })}
              >
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
                        id: 'members.roles',
                        defaultMessage: 'Roles',
                      })}
                    </TableCell>
                    <TableCell>
                      {intl.formatMessage({
                        id: 'people.lastActive',
                        defaultMessage: 'Last active',
                      })}
                    </TableCell>
                    {anyActions && (
                      <TableCell>
                        <Box component="span" sx={HIDDEN}>
                          {intl.formatMessage({
                            id: 'common.actions',
                            defaultMessage: 'Actions',
                          })}
                        </Box>
                      </TableCell>
                    )}
                  </TableRow>
                </TableHead>

                <TableBody>
                  {members?.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        {/* Their face beside their name (ADR-063). */}
                        <Stack
                          direction="row"
                          spacing={1.5}
                          sx={{ alignItems: 'center' }}
                        >
                          <PersonAvatar
                            userId={member.id}
                            name={member.name}
                            email={member.email}
                            photoFileId={member.photoFileId}
                          />
                          <span>
                            {member.name}
                            {you(member)}
                          </span>
                        </Stack>
                      </TableCell>
                      <TableCell
                        title={member.email}
                        sx={{
                          maxWidth: EMAIL_MAX_WIDTH,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {member.email}
                      </TableCell>
                      <TableCell>
                        <RoleChips roles={member.roles} />
                      </TableCell>
                      <TableCell
                        sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}
                        title={
                          member.lastActiveAt
                            ? formatMoment(member.lastActiveAt)
                            : undefined
                        }
                      >
                        {activeLabel(member, intl)}
                      </TableCell>
                      {anyActions && (
                        <TableCell align="right">{more(member)}</TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      <Menu
        id={menuId}
        anchorEl={menu?.anchor}
        open={menu?.open ?? false}
        onClose={() =>
          setMenu((current) => current && { ...current, open: false })
        }
        slotProps={{
          list: {
            'aria-label': menu
              ? intl.formatMessage(
                  { id: 'members.more', defaultMessage: 'More for {name}' },
                  { name: nameOf(menu.member) },
                )
              : undefined,
          },
          transition: { onExited: handOff },
        }}
      >
        {menu &&
          actionsOf(menu.member).map((action) =>
            action === 'change' ? (
              <MenuItem key={action} onClick={() => choose(action)}>
                {intl.formatMessage({
                  id: 'members.changeRoles',
                  defaultMessage: 'Change roles',
                })}
              </MenuItem>
            ) : (
              <MenuItem
                key={action}
                onClick={() => choose(action)}
                sx={{ color: 'error.main' }}
              >
                {intl.formatMessage({
                  id: 'members.remove',
                  defaultMessage: 'Remove from the organization',
                })}
              </MenuItem>
            ),
          )}
      </Menu>

      {opened?.kind === 'change' && (
        <ChangeRolesDialog
          key={`change-roles-${opened.key}`}
          open={opened.open}
          member={opened.member}
          roles={roles}
          onClose={close}
          onChanged={onChanged}
        />
      )}
      {opened?.kind === 'remove' && (
        <RemoveMemberDialog
          key={`remove-member-${opened.key}`}
          open={opened.open}
          member={opened.member}
          organizationName={organizationName}
          onClose={close}
          onRemoved={onRemoved}
        />
      )}
      {opened?.kind === 'refused' && (
        <CannotChangeDialog
          key={`cannot-change-${opened.key}`}
          open={opened.open}
          member={opened.member}
          action={opened.action}
          onClose={close}
        />
      )}
    </Box>
  );
}

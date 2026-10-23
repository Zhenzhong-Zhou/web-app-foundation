import Add from '@mui/icons-material/Add';
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
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink, useLocation } from 'react-router-dom';

import type { Role } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { EmptyState } from '../components/empty-state';
import { PageHeader } from '../components/page-header';
import { StatusChip } from '../components/status-chip';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { rem } from '../theme/rem';
import { heldByLabel, kindLabel, nameOf, ROLE_WORDS } from './role-words';

/** Where a deleted role's page sends its reader, to say focus goes here. */
export interface RolesPageState {
  focusHeading?: boolean;
}

/**
 * Settings → Roles (ADR-080): the organization's roles, the built-in
 * three first, then those it made, each with its line and how many hold
 * it. Every member reads it, as everyone reads People; Make a role is the
 * Owners'. A table on a computer, cards on a phone, as Members has.
 */
export function RolesPage() {
  const intl = useIntl();
  const can = useCan();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const {
    data: roles,
    error,
    refused,
    loading,
    reload,
  } = useResource<Role[]>('/roles');
  const showSkeleton = useDelayedFlag(loading);

  // A role deleted from its page took its Delete with it: focus starts
  // where the page does (ADR-080), as Home's does for a card dismissed.
  const heading = useRef<HTMLHeadingElement>(null);
  const state = useLocation().state as RolesPageState | null;
  useEffect(() => {
    if (state?.focusHeading) heading.current?.focus();
  }, [state]);

  const builtIn = roles?.filter((role) => role.builtIn) ?? [];
  const made = roles?.filter((role) => !role.builtIn) ?? [];

  const makeButton = can('roles.create') && (
    <Button
      variant="contained"
      startIcon={<Add />}
      component={RouterLink}
      to="/settings/roles/new"
    >
      {intl.formatMessage(ROLE_WORDS.makeRole)}
    </Button>
  );

  if (refused) {
    return (
      <RevisionRefusalPage failure={refused} onRetry={() => void reload()} />
    );
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage(ROLE_WORDS.roles)}
        headingRef={heading}
        actions={makeButton || undefined}
      />

      <Typography color="text.secondary" sx={{ maxWidth: rem(760) }}>
        {intl.formatMessage({
          id: 'roles.lead',
          defaultMessage:
            'A role is what someone may do here. A member can hold several roles, and may do whatever any of them allows. Only Owners make, change and delete roles.',
        })}
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      {!roles ? (
        showSkeleton && <Skeleton variant="rounded" height={240} />
      ) : (
        <>
          <RoleSection
            roles={builtIn}
            phone={phone}
            title={intl.formatMessage(ROLE_WORDS.builtIn)}
            lead={intl.formatMessage({
              id: 'roles.builtIn.lead',
              defaultMessage:
                'These stay as they are. To vary one, open it and make a copy.',
            })}
          />
          <RoleSection
            roles={made}
            phone={phone}
            title={intl.formatMessage(ROLE_WORDS.made)}
            lead={intl.formatMessage({
              id: 'roles.made.lead',
              defaultMessage:
                'Named in the language your team reads. They show as named, in every language.',
            })}
            empty={intl.formatMessage({
              id: 'roles.made.empty',
              defaultMessage:
                'None made here yet. A role made here starts from a template, such as Warehouse or Sales, or from a copy of any role.',
            })}
          />
        </>
      )}
    </Stack>
  );
}

/** One group of roles under its heading, with how many it holds. */
function RoleSection({
  roles,
  phone,
  title,
  lead,
  empty,
}: {
  roles: Role[];
  phone: boolean;
  title: string;
  lead: string;
  /** What the group says with nothing in it. */
  empty?: string;
}) {
  const intl = useIntl();
  const headingId = useId();

  const heading = (
    <Stack spacing={0.5} sx={phone ? undefined : { px: 2.5, pt: 2, pb: 1.5 }}>
      <Typography variant="h6" component="h2" id={headingId}>
        <FormattedMessage
          id="roles.section.heading"
          defaultMessage="{title} <muted>{count}</muted>"
          values={{
            title,
            count: roles.length,
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
      <Typography variant="body2" color="text.secondary">
        {lead}
      </Typography>
    </Stack>
  );

  const roleLink = (role: Role, stretched = false) => (
    <Link
      component={RouterLink}
      to={`/settings/roles/${role.id}`}
      sx={{
        fontWeight: 600,
        overflowWrap: 'anywhere',
        // On a phone the name is the link, stretched over its card.
        ...(stretched && {
          '&::after': { content: '""', position: 'absolute', inset: 0 },
        }),
      }}
    >
      {nameOf(role)}
    </Link>
  );

  const kind = (role: Role) => (
    <StatusChip
      tone={role.builtIn ? 'neutral' : 'info'}
      label={kindLabel(role, intl)}
    />
  );

  if (roles.length === 0 && empty) {
    return (
      <Paper variant="outlined" component="section" aria-labelledby={headingId}>
        <Box sx={phone ? { px: 2, pt: 2 } : undefined}>{heading}</Box>
        <EmptyState>{empty}</EmptyState>
      </Paper>
    );
  }

  return phone ? (
    <Stack component="section" aria-labelledby={headingId} spacing={1.25}>
      {heading}
      {roles.map((role) => (
        <Paper
          key={role.id}
          variant="outlined"
          component="article"
          sx={{
            position: 'relative',
            p: 1.75,
            '&:hover': { borderColor: 'primary.main' },
          }}
        >
          <Stack spacing={0.75}>
            <Stack
              direction="row"
              useFlexGap
              spacing={1}
              sx={{ alignItems: 'center', flexWrap: 'wrap' }}
            >
              {roleLink(role, true)}
              {kind(role)}
            </Stack>
            {role.description && (
              <Typography variant="body2">{role.description}</Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              {heldByLabel(role.holderCount, intl)}
            </Typography>
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
              <TableCell sx={{ width: '30%' }}>
                {intl.formatMessage({
                  id: 'roles.column.role',
                  defaultMessage: 'Role',
                })}
              </TableCell>
              <TableCell>
                {intl.formatMessage({
                  id: 'roles.column.for',
                  defaultMessage: 'What it is for',
                })}
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                {intl.formatMessage({
                  id: 'roles.column.heldBy',
                  defaultMessage: 'Held by',
                })}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.id}>
                <TableCell>
                  <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                    {roleLink(role)}
                    {kind(role)}
                  </Stack>
                </TableCell>
                <TableCell>{role.description}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {heldByLabel(role.holderCount, intl)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

import { Alert, Box, Skeleton, Stack, Typography } from '@mui/material';
import { useIntl } from 'react-intl';

import type { MemberAccess } from '../api/types.gen';
import { useAuth } from '../auth/use-auth';
import { useResource } from '../lib/use-resource';
import { roleDescription, roleLabel } from '../members/role-names';
import { WhatYouCanDo } from './what-you-can-do';

/**
 * Your access at this organization (ADR-079): the role, the line that says
 * what it is for, and what you can do here, so it outlasts the welcome on
 * Home. A role an organization made shows as it named and described it.
 */
export function YourAccess() {
  const intl = useIntl();
  const { session } = useAuth();
  const { data: access, error } = useResource<MemberAccess>(
    '/account/membership',
  );

  if (!session?.organization) return null;

  return (
    <Stack spacing={2}>
      <Typography variant="h6" component="h2">
        {intl.formatMessage(
          {
            id: 'account.access.heading',
            defaultMessage: 'Your access at {organization}',
          },
          { organization: session.organization.name },
        )}
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      {!access ? (
        !error && <Skeleton variant="rounded" height={96} />
      ) : (
        <>
          {access.roles.map((role) => {
            const description = roleDescription(role.name) ?? role.description;
            return (
              <Box key={role.name}>
                <Typography sx={{ fontWeight: 600 }}>
                  {roleLabel(role.name)}
                </Typography>
                {description && (
                  <Typography color="text.secondary">{description}</Typography>
                )}
              </Box>
            );
          })}
          <WhatYouCanDo access={access} />
        </>
      )}
    </Stack>
  );
}

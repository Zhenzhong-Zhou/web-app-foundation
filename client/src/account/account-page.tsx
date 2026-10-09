import { Box, Divider, Link, Paper, Stack } from '@mui/material';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { PageHeader } from '../components/page-header';
import { AccountPhoto } from './account-photo';
import { ChangePasswordForm } from './change-password-form';
import { ProfileForm } from './profile-form';
import { RecentWork } from './recent-work';
import { WorkDetailsForm } from './work-details-form';

/**
 * Your account (ADR-063): who you are, with your photo beside it; your
 * details at work, which colleagues see; signing in and security; and
 * your recent work. Each its own card, in that order.
 */
export function AccountPage() {
  const intl = useIntl();

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage({
          id: 'account.title',
          defaultMessage: 'Account',
        })}
      />

      <Paper
        variant="outlined"
        sx={{
          p: 3,
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            sm: '180px minmax(0, 1fr)',
          },
          gap: 3,
          alignItems: 'start',
        }}
      >
        <AccountPhoto />
        <ProfileForm />
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <WorkDetailsForm />
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={3} divider={<Divider />}>
          <ChangePasswordForm />
          <Box>
            <Link component={RouterLink} to="/account/sessions">
              {intl.formatMessage({
                id: 'account.sessions.title',
                defaultMessage: 'Active sessions',
              })}
            </Link>
          </Box>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <RecentWork />
      </Paper>
    </Stack>
  );
}

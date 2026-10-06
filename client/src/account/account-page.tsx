import { Divider, Link, Paper, Stack } from '@mui/material';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { PageHeader } from '../components/page-header';
import { ChangePasswordForm } from './change-password-form';
import { ProfileForm } from './profile-form';

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

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={4} divider={<Divider />}>
          <ProfileForm />
          <ChangePasswordForm />
        </Stack>
      </Paper>

      <Link component={RouterLink} to="/account/sessions">
        {intl.formatMessage({
          id: 'account.sessions.title',
          defaultMessage: 'Active sessions',
        })}
      </Link>
    </Stack>
  );
}

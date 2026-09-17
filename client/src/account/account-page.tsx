import { Divider, Link, Paper, Stack } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import { PageHeader } from '../components/page-header';
import { ChangePasswordForm } from './change-password-form';
import { ProfileForm } from './profile-form';

export function AccountPage() {
  return (
    <Stack spacing={3}>
      <PageHeader crumbs={[]} title="Account" />

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={4} divider={<Divider />}>
          <ProfileForm />
          <ChangePasswordForm />
        </Stack>
      </Paper>

      <Link component={RouterLink} to="/account/sessions">
        Active sessions
      </Link>
    </Stack>
  );
}

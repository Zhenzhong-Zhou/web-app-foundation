import { Divider, Link, Paper, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import { ChangePasswordForm } from './change-password-form';
import { ProfileForm } from './profile-form';

export function AccountPage() {
  return (
    <Stack spacing={3}>
      <Typography variant="h5" component="h1">
        Account
      </Typography>

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

import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { useState } from 'react';
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
  const [changingPassword, setChangingPassword] = useState(false);

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

      {/* One line, as designed (ADR-063): the password in a dialog, the
          devices on their own page. */}
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
        >
          <Box>
            <Typography variant="h6" component="h2">
              {intl.formatMessage({
                id: 'account.security.title',
                defaultMessage: 'Sign-in and security',
              })}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({
                id: 'account.security.intro',
                defaultMessage:
                  'Your password, and the devices signed in as you.',
              })}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              onClick={() => setChangingPassword(true)}
            >
              {intl.formatMessage({
                id: 'account.password.title',
                defaultMessage: 'Change password',
              })}
            </Button>
            <Button
              variant="outlined"
              component={RouterLink}
              to="/account/sessions"
            >
              {intl.formatMessage({
                id: 'account.security.devices',
                defaultMessage: 'Your devices',
              })}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Dialog
        open={changingPassword}
        onClose={() => setChangingPassword(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogContent>
          <ChangePasswordForm />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChangingPassword(false)}>
            {intl.formatMessage({
              id: 'common.close',
              defaultMessage: 'Close',
            })}
          </Button>
        </DialogActions>
      </Dialog>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <RecentWork />
      </Paper>
    </Stack>
  );
}

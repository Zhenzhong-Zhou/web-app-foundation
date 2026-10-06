import { Box, Container, Paper, Stack, Typography } from '@mui/material';
import type { ReactNode, SubmitEvent } from 'react';

import { LanguageSelect } from '../components/language-select';

/**
 * The frame every unauthenticated screen shares. Extracted at five, not two —
 * by then the shape had stopped being a guess.
 *
 * `component="form"` rather than a div with a click handler: submit-on-enter,
 * required-field behaviour, and password-manager detection all key off a real
 * form element (ADR-017).
 */
export function AuthLayout({
  title,
  onSubmit,
  children,
}: {
  title: string;
  onSubmit?: (event: SubmitEvent) => void;
  children: ReactNode;
}) {
  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      {/* Before anything else, so someone who cannot read the page can
          still find the one control that changes it (ADR-054). */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <LanguageSelect />
      </Box>
      <Paper sx={{ p: 4 }} elevation={0} variant="outlined">
        <Typography variant="h5" component="h1" sx={{ mb: 3 }}>
          {title}
        </Typography>

        <Box component={onSubmit ? 'form' : 'div'} onSubmit={onSubmit}>
          <Stack spacing={2}>{children}</Stack>
        </Box>
      </Paper>
    </Container>
  );
}

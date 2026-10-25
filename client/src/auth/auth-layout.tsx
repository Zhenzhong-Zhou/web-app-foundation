import { Box, Container, Paper, Stack, Typography } from '@mui/material';
import type { ReactNode, Ref, SubmitEvent } from 'react';

import { LanguageSelect } from '../components/language-select';
import { TextSizeSelect } from '../components/text-size-select';
import { LanguageFailureBanner } from '../i18n/language-failure';
import { useScreenShown } from '../lib/loading-mark';
import { NewVersionBanner } from '../version/new-version-banner';

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
  titleRef,
  above,
  notice,
  onSubmit,
  children,
}: {
  /** Left out only while a page is read, before it knows its heading. */
  title?: string;
  /** For a page that moves focus to its heading, so it is announced. */
  titleRef?: Ref<HTMLHeadingElement>;
  /** Before the heading: who a page is for, as an invitation's organization. */
  above?: ReactNode;
  /** Under the language choice: what came of a change made there. */
  notice?: ReactNode;
  onSubmit?: (event: SubmitEvent) => void;
  children: ReactNode;
}) {
  // A signed-out page on view: the loading mark comes down (ADR-082).
  useScreenShown();

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      {/* Before anything else, so someone who cannot read the page can
          still find the controls that change it: its language first
          (ADR-054), then its text size (ADR-075). */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          gap: 1,
          mb: 2,
        }}
      >
        <LanguageSelect />
        <TextSizeSelect />
      </Box>
      {/* A newer build, said here since these pages have no top bar, and
          a language that would not load (ADR-081). After the language,
          which stays first. */}
      <Stack spacing={2} sx={{ mb: 2, '&:empty': { display: 'none' } }}>
        <LanguageFailureBanner />
        <NewVersionBanner where="signedOut" />
      </Stack>
      {notice && <Box sx={{ mb: 2 }}>{notice}</Box>}
      <Paper sx={{ p: 4 }} elevation={0} variant="outlined">
        {above && <Box sx={{ mb: 2 }}>{above}</Box>}
        {title && (
          <Typography
            ref={titleRef}
            tabIndex={titleRef ? -1 : undefined}
            variant="h5"
            component="h1"
            sx={{ mb: 3 }}
          >
            {title}
          </Typography>
        )}

        <Box component={onSubmit ? 'form' : 'div'} onSubmit={onSubmit}>
          <Stack spacing={2}>{children}</Stack>
        </Box>
      </Paper>
    </Container>
  );
}

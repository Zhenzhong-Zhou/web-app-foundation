import { Box, Container, Typography } from '@mui/material';
import type { ReactNode } from 'react';

import { LanguageSelect } from '../components/language-select';
import { TextSizeSelect } from '../components/text-size-select';
import { copyrightLine, useAppName } from '../lib/app-name';
import { useScreenShown } from '../lib/loading-mark';
import { ProductLockup, ProductMark } from './product-mark';

/**
 * The frame of every screen before sign-in (ADR-082): the product's mark
 * and its name above the content, and the © line in a footer. One frame
 * for all of them, AuthLayout's pages, the status pages shown signed out
 * and the start-up screens, so they cannot drift apart. The name is text,
 * in the reader's language, never a picture of it; the mark beside it is
 * hidden from screen readers.
 *
 * `invitation`: the invitation's pages are the organization's (ADR-077),
 * headed by its logo and name, so Panivo is in their footer only, and two
 * marks never compete.
 */
export function SignedOutFrame({
  controls,
  invitation = false,
  children,
}: {
  /** Above the frame's content: the page's language and text size. */
  controls?: ReactNode;
  invitation?: boolean;
  children: ReactNode;
}) {
  // A screen before sign-in on view: the loading mark comes down (ADR-082),
  // here once for all of them.
  useScreenShown();
  const name = useAppName();
  const copyright = copyrightLine();

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <Container
        maxWidth="sm"
        sx={{
          flex: '1 0 auto',
          display: 'flex',
          flexDirection: 'column',
          pt: { xs: 2, sm: 4 },
          pb: 4,
        }}
      >
        {controls}
        <Box
          component="main"
          sx={{ flex: '1 0 auto', display: 'flex', flexDirection: 'column' }}
        >
          {!invitation && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1.5,
                mt: { xs: 1, sm: 2 },
                mb: 3,
              }}
            >
              <ProductMark size={36} />
              <Typography variant="h5" component="p" sx={{ lineHeight: 1 }}>
                {name}
              </Typography>
            </Box>
          )}
          {children}
        </Box>
      </Container>

      {/* Unset, as on a fork, no © line, and nothing else to say here
          but on an invitation. */}
      {(invitation || copyright) && (
        <Box
          component="footer"
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            columnGap: 2,
            rowGap: 0.5,
            px: 2,
            pb: 3,
            typography: 'body2',
            color: 'text.secondary',
          }}
        >
          {invitation && <ProductLockup />}
          {copyright && <span>{copyright}</span>}
        </Box>
      )}
    </Box>
  );
}

/**
 * The controls a screen before sign-in puts in the frame's slot, before
 * anything else, so someone who cannot read the page can still find what
 * changes it: its language first (ADR-054), then its text size (ADR-075).
 */
export function SignedOutControls() {
  return (
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
  );
}

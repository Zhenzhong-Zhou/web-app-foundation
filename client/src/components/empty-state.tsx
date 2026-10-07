import { Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

/**
 * What a list says when it has nothing to show (ADR-055), in the same frame
 * everywhere: inside the list's panel, where the rows would be, never as an
 * alert above it.
 *
 * The page writes the words, because only it knows which case it is in:
 * with no filter, what is missing, why it matters and what to do next
 * ("No locations yet. Start with a site…"); with a filter on, that nothing
 * matches it, never the first-time message. The action, when there is one,
 * is the button that makes the first.
 */
export function EmptyState({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Stack spacing={1.5} sx={{ p: 3, alignItems: 'flex-start' }}>
      <Typography color="text.secondary">{children}</Typography>
      {action}
    </Stack>
  );
}

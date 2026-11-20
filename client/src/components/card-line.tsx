import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

/**
 * A label and its value on a phone's card, the value at the right: a
 * movement's When or Reason, a code's On hand or Free (review 51).
 */
export function CardLine({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
    >
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
      <Box sx={{ textAlign: 'right', minWidth: 0 }}>{children}</Box>
    </Stack>
  );
}

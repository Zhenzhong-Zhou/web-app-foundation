import { Chip, Stack } from '@mui/material';

import type { RoleRef } from '../api/types.gen';
import { roleLabel } from '../members/role-names';

/**
 * A member's roles side by side (ADR-080), as Members and a role's page
 * show them: a built-in one in the reader's language, plain, and one the
 * organization made as it was named, on the accent's tint, so the two are
 * told apart by more than the words. Wraps rather than widening its cell.
 */
export function RoleChips({ roles }: { roles: readonly RoleRef[] }) {
  return (
    <Stack direction="row" useFlexGap spacing={0.75} sx={{ flexWrap: 'wrap' }}>
      {roles.map((role) => (
        <Chip
          key={role.id}
          size="small"
          label={roleLabel(role.name)}
          sx={role.builtIn ? undefined : { bgcolor: 'surface.chosen' }}
        />
      ))}
    </Stack>
  );
}

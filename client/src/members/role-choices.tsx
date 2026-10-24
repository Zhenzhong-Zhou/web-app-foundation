import {
  Box,
  Checkbox,
  Chip,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  Stack,
  Typography,
} from '@mui/material';
import { useId } from 'react';
import { useIntl } from 'react-intl';

import type { Role } from '../api/types.gen';
import { chosenCardSx } from '../components/chosen-card';
import { ROLE_WORDS } from '../roles/role-words';
import { isOwnerRole, roleLabel, toggled } from './role-names';

/**
 * The organization's roles as cards to tick, several to a person
 * (ADR-080), each with its line, on Invite and Change roles alike. A role
 * the reader's roles do not hold all of cannot be given: its card is off,
 * with the reason beneath its line, as Invite's Owner card was (ADR-077).
 * `problem`, "Choose at least one role", is marked on the whole set.
 */
export function RoleChoices({
  roles,
  value,
  onChange,
  ownerReason,
  problem = null,
}: {
  roles: readonly Role[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
  /** Why the Owner card is off: inviting an Owner, or making one. */
  ownerReason: string;
  problem?: string | null;
}) {
  const intl = useIntl();
  const id = useId();
  const legendId = `${id}-legend`;
  const problemId = `${id}-problem`;

  return (
    <Box
      component="fieldset"
      aria-describedby={problem ? problemId : undefined}
      sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}
    >
      <FormLabel
        component="legend"
        id={legendId}
        error={problem !== null}
        sx={{ fontWeight: 600, color: 'text.primary', mb: 1 }}
      >
        {intl.formatMessage({ id: 'members.roles', defaultMessage: 'Roles' })}
      </FormLabel>
      {problem && (
        <FormHelperText error id={problemId} sx={{ mx: 0, mt: -0.5, mb: 1 }}>
          {problem}
        </FormHelperText>
      )}
      <Stack spacing={1}>
        {roles.map((role) => {
          const nameId = `${id}-${role.id}-name`;
          const lineId = `${id}-${role.id}-line`;
          const owner = isOwnerRole(role);
          const lines = [
            role.description,
            owner
              ? intl.formatMessage({
                  id: 'members.roles.ownerAlone',
                  defaultMessage: 'An Owner holds no other role.',
                })
              : null,
            role.mayGive
              ? null
              : owner
                ? ownerReason
                : intl.formatMessage(
                    {
                      id: 'members.roles.cannotGive',
                      defaultMessage:
                        'Your roles don’t include everything {role} can do, so you can’t give it. An Owner can.',
                    },
                    { role: roleLabel(role.name) },
                  ),
          ].filter((line): line is string => Boolean(line));
          const chosen = value.includes(role.id);

          return (
            <FormControlLabel
              key={role.id}
              disabled={!role.mayGive}
              control={
                <Checkbox
                  checked={chosen}
                  onChange={(event) =>
                    onChange(
                      toggled(roles, value, role.id, event.target.checked),
                    )
                  }
                  slotProps={{
                    input: {
                      // Named by the role alone; its lines describe it.
                      'aria-labelledby': nameId,
                      'aria-describedby': lines.length > 0 ? lineId : undefined,
                    },
                  }}
                />
              }
              label={
                <Box component="span" sx={{ display: 'block', py: 0.5 }}>
                  <Box
                    component="span"
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      columnGap: 1,
                    }}
                  >
                    <Box component="span" id={nameId} sx={{ fontWeight: 600 }}>
                      {roleLabel(role.name)}
                    </Box>
                    {role.builtIn && (
                      <Chip
                        size="small"
                        label={intl.formatMessage(ROLE_WORDS.builtIn)}
                      />
                    )}
                  </Box>
                  {lines.length > 0 && (
                    <Typography
                      component="span"
                      id={lineId}
                      variant="body2"
                      sx={{ color: 'text.secondary', display: 'block' }}
                    >
                      {lines.map((line) => (
                        <Box
                          component="span"
                          key={line}
                          sx={{ display: 'block' }}
                        >
                          {line}
                        </Box>
                      ))}
                    </Typography>
                  )}
                </Box>
              }
              sx={chosenCardSx(chosen)}
            />
          );
        })}
      </Stack>
    </Box>
  );
}

import {
  Box,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useId } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import type { Role, RoleTemplate } from '../api/types.gen';
import { chosenCardSx } from '../components/chosen-card';
import { rem } from '../theme/rem';
import { nameOf } from './role-words';

/** Where making a role starts: a template, a copy, or nothing ticked. */
export type Start = RoleTemplate['key'] | 'copy' | 'nothing';

/**
 * Each template's few words, the client's (ADR-080): the server names a
 * template in the reader's language and lists its permissions, and what
 * it is for is said here, beside the choice.
 */
const TAGLINES = defineMessages<Start>({
  warehouse: {
    id: 'roles.start.warehouse',
    defaultMessage: 'Receive, ship, move stock',
  },
  sales: {
    id: 'roles.start.sales',
    defaultMessage: 'Customers, orders, drafts',
  },
  finance: {
    id: 'roles.start.finance',
    defaultMessage: 'Invoices, costs, prices',
  },
  production: {
    id: 'roles.start.production',
    defaultMessage: 'Recipes and runs',
  },
  stock_lookup: {
    id: 'roles.start.stockLookup',
    defaultMessage: 'Find stock and products, nothing else',
  },
  copy: {
    id: 'roles.start.copy',
    defaultMessage: 'Any role here, built in too',
  },
  nothing: {
    id: 'roles.start.nothing.line',
    defaultMessage: 'Only what every role holds',
  },
});

const WORDS = defineMessages({
  legend: { id: 'roles.start.legend', defaultMessage: 'Start from' },
  copy: { id: 'roles.start.copy.name', defaultMessage: 'A copy of a role' },
  nothing: { id: 'roles.start.nothing', defaultMessage: 'Nothing ticked' },
  copyOf: { id: 'roles.start.copyOf', defaultMessage: 'Role to copy' },
  help: {
    id: 'roles.start.help',
    defaultMessage: 'A start only: change any box below.',
  },
});

/**
 * Start from (ADR-080), first on the editor when a role is made: the five
 * templates, a copy of any role the organization has, a built-in one
 * included, or nothing ticked. Choosing one ticks its boxes; nothing more.
 */
export function StartFrom({
  templates,
  roles,
  value,
  copyId,
  onChange,
  onCopy,
}: {
  templates: RoleTemplate[];
  roles: Role[];
  value: Start | null;
  copyId: string;
  onChange: (start: Start) => void;
  onCopy: (roleId: string) => void;
}) {
  const intl = useIntl();
  const id = useId();
  const choices: { key: Start; name: string }[] = [
    ...templates.map((template) => ({
      key: template.key,
      name: template.name,
    })),
    { key: 'copy', name: intl.formatMessage(WORDS.copy) },
    { key: 'nothing', name: intl.formatMessage(WORDS.nothing) },
  ];

  return (
    <Box component="fieldset" sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
      <FormLabel
        component="legend"
        id={`${id}-legend`}
        sx={{ fontWeight: 600, color: 'text.primary', mb: 1 }}
      >
        {intl.formatMessage(WORDS.legend)}
      </FormLabel>
      <RadioGroup
        aria-labelledby={`${id}-legend`}
        aria-describedby={`${id}-help`}
        value={value ?? ''}
        onChange={(event) => {
          const start = choices.find(
            (choice) => choice.key === event.target.value,
          );
          if (start) onChange(start.key);
        }}
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${rem(200)}, 1fr))`,
          gap: 1,
        }}
      >
        {choices.map((choice) => {
          const chosen = choice.key === value;
          return (
            <FormControlLabel
              key={choice.key}
              value={choice.key}
              control={<Radio />}
              label={
                <Box component="span" sx={{ display: 'block', py: 0.5 }}>
                  <Box component="span" sx={{ fontWeight: 600 }}>
                    {choice.name}
                  </Box>
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{ color: 'text.secondary', display: 'block' }}
                  >
                    {intl.formatMessage(TAGLINES[choice.key])}
                  </Typography>
                </Box>
              }
              sx={chosenCardSx(chosen)}
            />
          );
        })}
      </RadioGroup>
      <Stack spacing={1.5} sx={{ mt: 1 }}>
        <Typography
          id={`${id}-help`}
          variant="body2"
          sx={{ color: 'text.secondary' }}
        >
          {intl.formatMessage(WORDS.help)}
        </Typography>
        {value === 'copy' && (
          <TextField
            id={`${id}-copy`}
            select
            label={intl.formatMessage(WORDS.copyOf)}
            value={copyId}
            onChange={(event) => onCopy(event.target.value)}
            sx={{ maxWidth: { sm: rem(320) } }}
          >
            {roles.map((role) => (
              <MenuItem key={role.id} value={role.id}>
                {nameOf(role)}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Stack>
    </Box>
  );
}

import ExpandMore from '@mui/icons-material/ExpandMore';
import {
  Box,
  ButtonBase,
  Collapse,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import { type ReactNode, useId, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type { MemberAccess } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { useAuth } from '../auth/use-auth';
import { AccessList } from './access-list';
import { accessAreas } from './access-phrases';

/**
 * What you can do here (ADR-079): a sentence per area the reader may
 * touch, from the session's permissions, and whom to ask for more, each
 * name opening their page on People for whoever may open People, and
 * plain for anyone else. One line for whoever holds every
 * permission. The welcome on Home and Your access on Account both show it.
 *
 * `folded`, on a phone's welcome: one row that opens on a tap, so the card
 * stays a screen long and what to do comes before what to read.
 */
export function WhatYouCanDo({
  access,
  folded = false,
}: {
  access: MemberAccess;
  folded?: boolean;
}) {
  const intl = useIntl();
  const { session } = useAuth();
  const can = useCan();
  const [open, setOpen] = useState(false);
  const listId = useId();

  if (access.holdsEverything) {
    return (
      <Typography>
        <FormattedMessage
          id="account.access.everything"
          defaultMessage="You may do <b>everything</b> here, including settings and closing the organization."
          values={{ b: (chunks: ReactNode[]) => <strong>{chunks}</strong> }}
        />
      </Typography>
    );
  }

  const permissions = session?.permissions ?? [];
  const title = intl.formatMessage({
    id: 'account.access.title',
    defaultMessage: 'What you can do here',
  });

  const body = (
    <Stack spacing={0.75}>
      <AccessList permissions={permissions} />
      {access.whomToAsk.length > 0 && (
        <Typography>
          {intl.formatMessage(
            {
              id: 'account.access.ask',
              defaultMessage: 'To do more, ask {names}.',
            },
            {
              names: intl.formatList(
                access.whomToAsk.map((person) =>
                  can('users.view') ? (
                    <Link
                      key={person.id}
                      component={RouterLink}
                      to={`/people/${person.id}`}
                      underline="always"
                    >
                      {person.name}
                    </Link>
                  ) : (
                    <span key={person.id}>{person.name}</span>
                  ),
                ),
                { type: 'disjunction' },
              ),
            },
          )}
        </Typography>
      )}
    </Stack>
  );

  if (!folded) {
    return (
      <Stack spacing={0.75}>
        <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        {body}
      </Stack>
    );
  }

  return (
    <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
      <Typography variant="subtitle1" component="h3">
        <ButtonBase
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen(!open)}
          sx={{
            width: '100%',
            minHeight: 44,
            py: 1,
            gap: 1,
            justifyContent: 'space-between',
            textAlign: 'start',
            font: 'inherit',
          }}
        >
          <Stack component="span">
            <Box component="span" sx={{ fontWeight: 600 }}>
              {title}
            </Box>
            <Typography component="span" variant="body2" color="text.secondary">
              {intl.formatMessage(
                {
                  id: 'account.access.folded',
                  defaultMessage:
                    '{count, plural, one {# area} other {# areas}}, tap to open',
                },
                { count: accessAreas(intl, permissions).length },
              )}
            </Typography>
          </Stack>
          <ExpandMore
            aria-hidden
            sx={{
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 150ms',
            }}
          />
        </ButtonBase>
      </Typography>
      <Collapse in={open} id={listId}>
        {body}
      </Collapse>
    </Box>
  );
}

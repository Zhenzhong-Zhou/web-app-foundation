import { Link, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type { MemberAccess } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { useAuth } from '../auth/use-auth';
import { listNameParts } from '../i18n/list-names';
import { AccessList } from './access-list';

/**
 * What you can do here (ADR-079): a sentence per area the reader may
 * touch, from the session's permissions, and whom to ask for more, each
 * name opening their page on People for whoever may open People, and
 * plain for anyone else. One line for whoever holds every
 * permission. The welcome on Home and Your access on Account both show it.
 *
 * `linked`, in the welcome: each area's name a link to its page (ADR-091).
 */
export function WhatYouCanDo({
  access,
  linked = false,
}: {
  access: MemberAccess;
  linked?: boolean;
}) {
  const intl = useIntl();
  const { session } = useAuth();
  const can = useCan();

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

  return (
    <Stack spacing={0.75}>
      <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <AccessList permissions={permissions} linked={linked} />
      {access.whomToAsk.length > 0 && (
        <Typography>
          {intl.formatMessage(
            {
              id: 'account.access.ask',
              defaultMessage: 'To do more, ask {names}.',
            },
            {
              names: listNameParts(
                intl,
                access.whomToAsk.map((person) => person.name),
                { type: 'disjunction' },
                (name, index) => {
                  const person = access.whomToAsk[index];
                  return can('users.view') ? (
                    <Link
                      key={person.id}
                      component={RouterLink}
                      to={`/people/${person.id}`}
                      underline="always"
                    >
                      {name}
                    </Link>
                  ) : (
                    <span key={person.id}>{name}</span>
                  );
                },
              ),
            },
          )}
        </Typography>
      )}
    </Stack>
  );
}

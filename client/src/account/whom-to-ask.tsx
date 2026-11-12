import { Typography } from '@mui/material';
import { type MessageDescriptor, useIntl } from 'react-intl';

import type { MemberAccess } from '../api/types.gen';
import { useResource } from '../lib/use-resource';

/**
 * "Your role does not include …", then whom to ask, the people the welcome
 * and Your access name (ADR-079; ADR-091): one quiet line where an action
 * the role lacks would be, on Home and on Orders. Nothing until the names
 * are known, so the line never changes under the reader; with none, or the
 * read failed, the line alone. `ask` takes `{names}`.
 */
export function WhomToAsk({
  access,
  none,
  ask,
}: {
  /** Undefined while still being read. */
  access: MemberAccess | null | undefined;
  none: MessageDescriptor;
  ask: MessageDescriptor;
}) {
  const intl = useIntl();
  if (access === undefined) return null;
  const names = access?.whomToAsk.map((person) => person.name) ?? [];

  return (
    <Typography sx={{ color: 'text.secondary' }}>
      {names.length > 0
        ? intl.formatMessage(ask, {
            names: intl.formatList(names, { type: 'disjunction' }),
          })
        : intl.formatMessage(none)}
    </Typography>
  );
}

/** The same, from Your access's own read, where nothing else holds it. */
export function WhomToAskRead({
  none,
  ask,
}: {
  none: MessageDescriptor;
  ask: MessageDescriptor;
}) {
  const { data, error } = useResource<MemberAccess>('/account/membership');
  return (
    <WhomToAsk
      access={data ?? (error ? null : undefined)}
      none={none}
      ask={ask}
    />
  );
}

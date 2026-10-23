import {
  Alert,
  Box,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { useAuth } from '../auth/use-auth';
import { PageHeader } from '../components/page-header';
import { PersonAvatar } from '../components/person-avatar';
import { StatusChip } from '../components/status-chip';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import { formatDayShort } from '../lib/format';
import { organizationToday } from '../lib/time-zone';
import { useResource } from '../lib/use-resource';
import { RoleChips } from '../roles/role-chips';
import { rem } from '../theme/rem';
import { joinedRecently, type Person, phoneLine } from './people-types';

/** One line of a card, cut with an ellipsis, whole on hover. */
const ONE_LINE = {
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

/**
 * The organization's people (ADR-063), for finding someone: a card each
 * with the face, name, title, role and work phone. The whole card opens
 * the person's page; the phone calls. Read-only: Members manages them.
 * Whoever joined in the last two weeks is marked New, and the line under
 * the title says how many, so colleagues know whom to greet (ADR-079).
 */
export function PeoplePage() {
  const intl = useIntl();
  const { session } = useAuth();
  const {
    data: people,
    error,
    refused,
    reload,
  } = useResource<Person[]>('/people');
  const [search, setSearch] = useState('');
  const today = organizationToday();
  const joined = useMemo(
    () =>
      new Map(
        (people ?? []).map((person) => [
          person.id,
          joinedRecently(person, today),
        ]),
      ),
    [people, today],
  );
  const newCount = [...joined.values()].filter(Boolean).length;

  const shown = useMemo(() => {
    const wanted = search.trim().toLowerCase();
    if (!people || !wanted) return people ?? [];
    return people.filter((person) =>
      [person.name, person.jobTitle, person.department, person.email]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(wanted)),
    );
  }, [people, search]);

  if (refused) {
    return (
      <RevisionRefusalPage failure={refused} onRetry={() => void reload()} />
    );
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage({
          id: 'people.title',
          defaultMessage: 'People',
        })}
        subtitle={
          !people
            ? undefined
            : newCount > 0
              ? intl.formatMessage(
                  {
                    id: 'people.countWithNew',
                    defaultMessage:
                      'Everyone in {organization}, {count, plural, one {# person} other {# people}}. {joined, plural, one {# joined} other {# joined}} in the last two weeks.',
                  },
                  {
                    organization: session?.organization?.name ?? '',
                    count: people.length,
                    joined: newCount,
                  },
                )
              : intl.formatMessage(
                  {
                    id: 'people.count',
                    defaultMessage:
                      'Everyone in {organization}, {count, plural, one {# person} other {# people}}.',
                  },
                  {
                    organization: session?.organization?.name ?? '',
                    count: people.length,
                  },
                )
        }
        actions={
          <TextField
            size="small"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={intl.formatMessage({
              id: 'people.search',
              defaultMessage: 'Search name, title, department or email',
            })}
            slotProps={{
              htmlInput: {
                'aria-label': intl.formatMessage({
                  id: 'people.searchLabel',
                  defaultMessage: 'Search people',
                }),
              },
            }}
            sx={{ width: { xs: '100%', sm: rem(340) } }}
          />
        }
      />

      {error && <Alert severity="error">{error}</Alert>}

      {people && shown.length === 0 && (
        <Typography sx={{ color: 'text.secondary' }}>
          {intl.formatMessage({
            id: 'people.none',
            defaultMessage: 'Nobody matches that search.',
          })}
        </Typography>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            sm: 'repeat(2, minmax(0, 1fr))',
            md: 'repeat(3, minmax(0, 1fr))',
            lg: 'repeat(4, minmax(0, 1fr))',
          },
          gap: 2,
        }}
      >
        {shown.map((person) => {
          const phone = phoneLine(person, intl);
          const joinedOn = joined.get(person.id);
          return (
            <Paper
              key={person.id}
              variant="outlined"
              component="article"
              sx={{
                position: 'relative',
                p: 2.5,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.75,
                textAlign: 'center',
                minWidth: 0,
                '&:hover': { borderColor: 'primary.main' },
              }}
            >
              {/* The mark's room on every card while anyone has it, so the
                  faces in a row stay level. */}
              {newCount > 0 && !joinedOn && <Box sx={{ height: 24 }} />}
              {joinedOn && (
                <StatusChip
                  tone="info"
                  label={intl.formatMessage(
                    {
                      id: 'people.new',
                      defaultMessage:
                        '{today, select, true {New · joined today} other {New · joined {day}}}',
                    },
                    {
                      today: String(joinedOn === today),
                      day: formatDayShort(joinedOn),
                    },
                  )}
                />
              )}
              <PersonAvatar
                userId={person.id}
                name={person.name}
                email={person.email}
                photoFileId={person.photoFileId}
                size={72}
              />
              {/* The name is the link, stretched over the card, so a phone
                  link inside stays a link of its own. */}
              <Link
                component={RouterLink}
                to={`/people/${person.id}`}
                underline="hover"
                sx={{
                  color: 'text.primary',
                  mt: 0.5,
                  fontWeight: 600,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  '&::after': { content: '""', position: 'absolute', inset: 0 },
                }}
              >
                {person.name}
              </Link>
              {person.jobTitle && (
                <Typography
                  variant="body2"
                  title={person.jobTitle}
                  sx={ONE_LINE}
                >
                  {person.jobTitle}
                </Typography>
              )}
              <RoleChips roles={person.roles} />
              {phone && (
                <Link
                  href={`tel:${(person.workPhone ?? '').replace(/[^0-9+]/g, '')}${person.extension ? `,${person.extension}` : ''}`}
                  variant="body2"
                  title={phone}
                  sx={{ ...ONE_LINE, position: 'relative', zIndex: 1 }}
                >
                  {phone}
                </Link>
              )}
            </Paper>
          );
        })}
      </Box>
    </Stack>
  );
}

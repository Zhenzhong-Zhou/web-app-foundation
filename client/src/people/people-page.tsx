import {
  Alert,
  Box,
  Chip,
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
import { useResource } from '../lib/use-resource';
import { roleLabel } from '../members/role-names';
import { type Person, phoneLine } from './people-types';

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
 */
export function PeoplePage() {
  const intl = useIntl();
  const { session } = useAuth();
  const { data: people, error } = useResource<Person[]>('/people');
  const [search, setSearch] = useState('');

  const shown = useMemo(() => {
    const wanted = search.trim().toLowerCase();
    if (!people || !wanted) return people ?? [];
    return people.filter((person) =>
      [person.name, person.jobTitle, person.department, person.email]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(wanted)),
    );
  }, [people, search]);

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage({
          id: 'people.title',
          defaultMessage: 'People',
        })}
        subtitle={
          people
            ? intl.formatMessage(
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
            : undefined
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
            sx={{ width: { xs: '100%', sm: 340 } }}
          />
        }
      />

      {error && <Alert severity="error">{error}</Alert>}

      {people && shown.length === 0 && (
        <Typography color="text.secondary">
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
                color="text.primary"
                sx={{
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
              <Chip size="small" label={roleLabel(person.roleName)} />
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

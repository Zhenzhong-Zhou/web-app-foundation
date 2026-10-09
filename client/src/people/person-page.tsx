import {
  Box,
  Chip,
  Link,
  List,
  ListItem,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink, useParams } from 'react-router-dom';

import { describe } from '../audit/audit-format';
import { PageHeader } from '../components/page-header';
import { PersonAvatar } from '../components/person-avatar';
import { LoadFailure } from '../errors/load-failure';
import { relativeTime, SEPARATOR } from '../lib/format';
import { useResource } from '../lib/use-resource';
import { roleLabel } from '../members/role-names';
import { activeLabel, type Person, phoneLine } from './people-types';

/**
 * A person's page (ADR-063): who they are and how to reach them, only the
 * details they filled in; for those who may read the history, the last 20
 * things they did, with the way to all of it.
 */
export function PersonPage() {
  const intl = useIntl();
  const { userId } = useParams<{ userId: string }>();
  const {
    data: person,
    error,
    failure,
  } = useResource<Person>(`/people/${userId ?? ''}`);

  const peopleLabel = intl.formatMessage({
    id: 'people.title',
    defaultMessage: 'People',
  });

  if (failure) {
    return (
      <LoadFailure
        failure={failure}
        message={error ?? ''}
        missingTitle={intl.formatMessage({
          id: 'status.missing.person',
          defaultMessage: 'This person isn’t in your organization',
        })}
        list={{ to: '/people', label: peopleLabel }}
      />
    );
  }
  if (!person) return null;

  const phone = phoneLine(person, intl);
  const rows: [string, ReactNode][] = [
    [
      intl.formatMessage({
        id: 'people.department',
        defaultMessage: 'Department',
      }),
      person.department,
    ],
    [
      intl.formatMessage({ id: 'people.location', defaultMessage: 'Location' }),
      person.location,
    ],
    [
      intl.formatMessage({
        id: 'people.workPhone',
        defaultMessage: 'Work phone',
      }),
      phone && (
        <Link
          href={`tel:${(person.workPhone ?? '').replace(/[^0-9+]/g, '')}${person.extension ? `,${person.extension}` : ''}`}
        >
          {phone}
        </Link>
      ),
    ],
    [
      intl.formatMessage({ id: 'people.email', defaultMessage: 'Email' }),
      <Link key="email" href={`mailto:${person.email}`}>
        {person.email}
      </Link>,
    ],
    [
      intl.formatMessage({
        id: 'people.memberSince',
        defaultMessage: 'Member since',
      }),
      intl.formatDate(person.memberSince, { year: 'numeric', month: 'long' }),
    ],
  ];
  const filledIn = Boolean(
    person.jobTitle || person.department || person.location || phone,
  );
  const firstName = person.name.split(/\s+/)[0] || person.name;

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[{ label: peopleLabel, to: '/people' }]}
        title={person.name}
      />

      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2, sm: 3 },
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            sm: '180px minmax(0, 1fr)',
          },
          gap: 3,
          alignItems: 'start',
        }}
      >
        <Stack spacing={1} sx={{ alignItems: 'center' }}>
          <PersonAvatar
            userId={person.id}
            name={person.name}
            email={person.email}
            photoFileId={person.photoFileId}
            size={160}
          />
          <Typography
            variant="body2"
            color="text.secondary"
            title={
              person.lastActiveAt
                ? new Date(person.lastActiveAt).toLocaleString()
                : undefined
            }
          >
            {activeLabel(person, intl)}
          </Typography>
        </Stack>

        <Stack spacing={0.5} sx={{ minWidth: 0 }}>
          {person.jobTitle && (
            <Typography variant="h6" component="p">
              {person.jobTitle}
            </Typography>
          )}
          <Box>
            <Chip size="small" label={roleLabel(person.roleName)} />
          </Box>
          {!filledIn && (
            <Typography color="text.secondary" sx={{ pt: 1 }}>
              {intl.formatMessage(
                {
                  id: 'people.nothingFilledIn',
                  defaultMessage: "{name} hasn't added their work details yet.",
                },
                { name: firstName },
              )}
            </Typography>
          )}
          <Box component="dl" sx={{ m: 0, pt: 1 }}>
            {rows
              .filter(([, value]) => Boolean(value))
              .map(([label, value]) => (
                <Box
                  key={label}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '140px minmax(0, 1fr)',
                    gap: 1.5,
                    py: 1,
                    borderTop: 1,
                    borderColor: 'divider',
                  }}
                >
                  <Typography component="dt" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography
                    component="dd"
                    sx={{ m: 0, overflowWrap: 'anywhere' }}
                  >
                    {value}
                  </Typography>
                </Box>
              ))}
          </Box>
        </Stack>
      </Paper>

      {/* Only there for those who may read the history (ADR-063). */}
      {person.recentActivity && (
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" component="h2">
            {intl.formatMessage({
              id: 'people.recentActivity',
              defaultMessage: 'Recent activity',
            })}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {intl.formatMessage(
              {
                id: 'people.recentActivityWhy',
                defaultMessage:
                  'The last 20 things {name} did here. You see this because you may read the history; others see only who {name} is.',
              },
              { name: firstName },
            )}
          </Typography>
          {person.recentActivity.length === 0 ? (
            <Typography sx={{ pt: 2 }} color="text.secondary">
              {intl.formatMessage({
                id: 'people.noActivity',
                defaultMessage: 'Nothing yet.',
              })}
            </Typography>
          ) : (
            <List dense>
              {person.recentActivity.map((entry) => (
                <ListItem key={entry.id} disableGutters divider>
                  <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }}>
                    {[describe(entry.action), entry.resourceLabel]
                      .filter(Boolean)
                      .join(SEPARATOR)}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ whiteSpace: 'nowrap', pl: 2 }}
                  >
                    {relativeTime(entry.createdAt)}
                  </Typography>
                </ListItem>
              ))}
            </List>
          )}
          <Link
            component={RouterLink}
            to={`/audit?actorId=${person.id}`}
            sx={{ fontWeight: 600 }}
          >
            {intl.formatMessage(
              {
                id: 'people.seeAll',
                defaultMessage: "See all of {name}'s activity",
              },
              { name: firstName },
            )}
          </Link>
        </Paper>
      )}
    </Stack>
  );
}

import ApartmentOutlined from '@mui/icons-material/ApartmentOutlined';
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined';
import {
  Avatar,
  Box,
  Button,
  Link,
  Paper,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { ReactNode, RefObject } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { WhatYouCanDo } from '../account/what-you-can-do';
import type { Welcome } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { useAuth } from '../auth/use-auth';
import { PersonAvatar } from '../components/person-avatar';
import { formatDayMonth } from '../lib/format';
import { organizationToday } from '../lib/time-zone';
import { roleLabel } from '../members/role-names';
import { FirstWeek } from './first-week';

/**
 * The welcome (ADR-079): the member's own card on Home for their first two
 * weeks, with the inviter's note, what they can do here and their first
 * week. It names the day it goes, so it never vanishes unexplained, and its
 * foot says where Help is, in place of a tour.
 *
 * Two columns on a computer: the note and what you can do here, beside the
 * first week. On a phone, one: the note, the first week, then what you can
 * do here folded into one row, so what to do comes before what to read.
 * `startShows`, while Getting started is below it and is their list.
 */
export function WelcomeCard({
  welcome,
  startShows,
  onDismiss,
  headingRef,
}: {
  welcome: Welcome;
  startShows: boolean;
  onDismiss: () => void;
  /** The title, for Home to move focus to when Undo brings the card back. */
  headingRef?: RefObject<HTMLHeadingElement | null>;
}) {
  const intl = useIntl();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const { session } = useAuth();
  const can = useCan();
  const organization = session?.organization?.name ?? '';
  const { access } = welcome;

  const today = welcome.joinedOn === organizationToday();
  const role = roleLabel(access.role.name);

  const who = welcome.founder
    ? today
      ? intl.formatMessage({
          id: 'home.welcome.started.today',
          defaultMessage: 'You started this organization today.',
        })
      : intl.formatMessage(
          {
            id: 'home.welcome.started',
            defaultMessage: 'You started this organization on {day}.',
          },
          { day: formatDayMonth(welcome.joinedOn) },
        )
    : today
      ? intl.formatMessage(
          {
            id: 'home.welcome.joined.today',
            defaultMessage:
              'You joined today as {name, select, Owner {an {role}} Admin {an {role}} Viewer {a {role}} other {{role}}}.',
          },
          { name: access.role.name, role },
        )
      : intl.formatMessage(
          {
            id: 'home.welcome.joined',
            defaultMessage:
              'You joined on {day} as {name, select, Owner {an {role}} Admin {an {role}} Viewer {a {role}} other {{role}}}.',
          },
          {
            day: formatDayMonth(welcome.joinedOn),
            name: access.role.name,
            role,
          },
        );
  const until = today
    ? intl.formatMessage(
        {
          id: 'home.welcome.until.today',
          defaultMessage:
            'This card stays on Home for your first two weeks, until {day}.',
        },
        { day: formatDayMonth(welcome.lastDay) },
      )
    : intl.formatMessage(
        {
          id: 'home.welcome.until',
          defaultMessage: 'This card stays on Home until {day}.',
        },
        { day: formatDayMonth(welcome.lastDay) },
      );

  const note = welcome.note && (
    <Box
      component="figure"
      sx={{
        m: 0,
        display: 'flex',
        gap: 1.5,
        alignItems: 'flex-start',
        bgcolor: 'action.hover',
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        px: 2,
        py: 1.75,
      }}
    >
      <Box aria-hidden sx={{ flex: 'none' }}>
        {welcome.inviter ? (
          <PersonAvatar
            userId={welcome.inviter.id}
            name={welcome.inviter.name}
            photoFileId={welcome.inviter.photoFileId}
            size={40}
          />
        ) : (
          <Avatar sx={{ width: 40, height: 40 }}>
            <ApartmentOutlined />
          </Avatar>
        )}
      </Box>
      <Stack spacing={0.5} sx={{ minWidth: 0 }}>
        <Typography
          component="figcaption"
          variant="body2"
          color="text.secondary"
          sx={{ fontWeight: 600 }}
        >
          {welcome.inviter ? (
            <FormattedMessage
              id="home.welcome.wrote"
              defaultMessage="<link>{name}</link> wrote"
              values={{
                name: welcome.inviter.name,
                // Their page on People, for whoever may open it.
                link: (chunks: ReactNode[]) =>
                  can('users.view') ? (
                    <Link
                      component={RouterLink}
                      to={`/people/${welcome.inviter?.id}`}
                      underline="always"
                    >
                      {chunks}
                    </Link>
                  ) : (
                    chunks
                  ),
              }}
            />
          ) : (
            intl.formatMessage(
              {
                id: 'home.welcome.fromOrganization',
                defaultMessage: 'From {organization}',
              },
              { organization },
            )
          )}
        </Typography>
        {/* Plain text, as typed (ADR-077). */}
        <Typography
          component="blockquote"
          sx={{ m: 0, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}
        >
          {welcome.note}
        </Typography>
      </Stack>
    </Box>
  );

  const startLine = startShows && (
    <Typography color="text.secondary">
      {intl.formatMessage({
        id: 'home.welcome.startBelow',
        defaultMessage:
          'Setting up the organization is in Getting started, below.',
      })}
    </Typography>
  );

  const week = (
    <FirstWeek
      items={welcome.items}
      canSeeProducts={can('products.view')}
      canInvite={can('users.create')}
    />
  );
  const youCan = (
    <WhatYouCanDo access={access} folded={phone && !access.holdsEverything} />
  );

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby="welcome-title"
      sx={{
        p: { xs: 2, sm: 3 },
        borderTop: 4,
        borderTopColor: 'primary.main',
        display: 'flex',
        flexDirection: 'column',
        gap: 2.5,
      }}
    >
      <Stack
        direction="row"
        sx={{
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 1.5,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            ref={headingRef}
            variant="h5"
            component="h2"
            id="welcome-title"
            tabIndex={-1}
          >
            {intl.formatMessage(
              {
                id: 'home.welcome.title',
                defaultMessage: 'Welcome to {organization}, {name}',
              },
              { organization, name: session?.user.name ?? '' },
            )}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {intl.formatMessage(
              { id: 'home.welcome.lead', defaultMessage: '{who} {until}' },
              { who, until },
            )}
          </Typography>
        </Box>
        <Button
          variant="text"
          onClick={onDismiss}
          aria-label={intl.formatMessage({
            id: 'home.welcome.dismissLabel',
            defaultMessage: 'Dismiss the welcome card',
          })}
          sx={{ flex: 'none' }}
        >
          {intl.formatMessage({
            id: 'home.welcome.dismiss',
            defaultMessage: 'Dismiss',
          })}
        </Button>
      </Stack>

      {phone ? (
        // What to do before what to read; one line for whoever may do
        // everything stays first, as it is no longer to read than a row.
        <Stack spacing={2.5}>
          {note}
          {access.holdsEverything && youCan}
          {week}
          {!access.holdsEverything && youCan}
          {startLine}
        </Stack>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'minmax(0, 1fr)',
              md: 'repeat(2, minmax(0, 1fr))',
            },
            gap: 3.5,
            alignItems: 'start',
          }}
        >
          <Stack spacing={2.5} sx={{ minWidth: 0 }}>
            {note}
            {youCan}
            {startLine}
          </Stack>
          <Box sx={{ minWidth: 0 }}>{week}</Box>
        </Box>
      )}

      <Typography
        sx={{
          display: 'flex',
          gap: 1.25,
          alignItems: 'center',
          borderTop: 1,
          borderColor: 'divider',
          pt: 1.75,
        }}
      >
        <HelpOutlineOutlined color="primary" aria-hidden />
        <span>
          <FormattedMessage
            id="home.welcome.help"
            defaultMessage="Every page has <b>Help</b> at the top, beside the bell. It explains the page you’re on."
            values={{ b: (chunks: ReactNode[]) => <strong>{chunks}</strong> }}
          />
        </span>
      </Typography>
    </Paper>
  );
}

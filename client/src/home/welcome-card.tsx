import ApartmentOutlined from '@mui/icons-material/ApartmentOutlined';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined';
import WavingHandOutlined from '@mui/icons-material/WavingHandOutlined';
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
import { type ReactNode, type RefObject, useId, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink, useLocation } from 'react-router-dom';

import { WhatYouCanDo } from '../account/what-you-can-do';
import type { Welcome } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { useAuth } from '../auth/use-auth';
import { IconBadge } from '../components/icon-badge';
import { PersonAvatar } from '../components/person-avatar';
import { guideFor } from '../help/guides';
import { useHelp } from '../help/use-help';
import { formatDayMonth } from '../lib/format';
import { organizationToday } from '../lib/time-zone';
import { articleOf, roleList } from '../members/role-names';
import { FirstWeek } from './first-week';
import { TONAL } from './tonal';

/**
 * The welcome (ADR-079; ADR-091): the member's own card on Home for their
 * first two weeks. Its head names it and says how far the first week has
 * come; below `md` it starts folded to that one line, with Open, and from
 * `md` open, with Fold, until the reader chooses. Open, it holds the day
 * the card goes, so it never vanishes
 * unexplained, the inviter's note, the first week's items, what they can
 * do here, each area a link to its page, and where Help is, in place of a
 * tour. `startShows`, while Getting started is below it and is their list.
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
  const wide = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true });
  // Folded below `md`, open from it, until the reader chooses: a foldable
  // opened follows its new width while nobody has.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? wide;
  const bodyId = useId();
  const { session } = useAuth();
  const can = useCan();
  const help = useHelp();
  const { pathname } = useLocation();
  const organization = session?.organization?.name ?? '';
  const { access } = welcome;

  const today = welcome.joinedOn === organizationToday();
  // Every role they hold, as a list; the article only for a built-in one
  // held alone (ADR-080).
  const role = roleList(access.roles);
  const name = articleOf(access.roles);

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
          { name, role },
        )
      : intl.formatMessage(
          {
            id: 'home.welcome.joined',
            defaultMessage:
              'You joined on {day} as {name, select, Owner {an {role}} Admin {an {role}} Viewer {a {role}} other {{role}}}.',
          },
          {
            day: formatDayMonth(welcome.joinedOn),
            name,
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
          sx={{ color: 'text.secondary', fontWeight: 600 }}
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
    <Typography sx={{ color: 'text.secondary' }}>
      {intl.formatMessage({
        id: 'home.welcome.startBelow',
        defaultMessage:
          'Setting up the organization is in Getting started, below.',
      })}
    </Typography>
  );

  const done = welcome.items.filter((item) => item.done).length;

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby="welcome-title"
      sx={{ overflow: 'hidden' }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: 'center', px: 2, py: 1.5 }}
      >
        <IconBadge sx={{ bgcolor: 'surface.chosen', color: 'primary.main' }}>
          <WavingHandOutlined fontSize="small" />
        </IconBadge>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* The section size, as Home's other headings (ADR-091's
              review), told from the line under it by size. */}
          <Typography
            ref={headingRef}
            variant="h6"
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
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {intl.formatMessage(
              {
                id: 'home.welcome.weekProgress',
                defaultMessage: 'Your first week · {done} of {total} done',
              },
              { done, total: welcome.items.length },
            )}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          color="inherit"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setChosen(!open)}
          endIcon={open ? <ExpandLess /> : <ExpandMore />}
          sx={{ flex: 'none', borderColor: 'divider' }}
        >
          {open
            ? intl.formatMessage({
                id: 'home.welcome.fold',
                defaultMessage: 'Fold',
              })
            : intl.formatMessage({
                id: 'home.welcome.open',
                defaultMessage: 'Open',
              })}
        </Button>
      </Stack>

      {open && (
        <Box id={bodyId}>
          <Stack spacing={1.25} sx={{ px: 2, pb: 2 }}>
            <Typography sx={{ color: 'text.secondary' }}>
              {intl.formatMessage(
                { id: 'home.welcome.lead', defaultMessage: '{who} {until}' },
                { who, until },
              )}
            </Typography>
            {note}
          </Stack>
          <FirstWeek
            items={welcome.items}
            canSeeProducts={can('products.view')}
            canInvite={can('users.create')}
            canMoveStock={can('stock.move')}
          />
          <Stack
            spacing={1.5}
            sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}
          >
            {startLine}
            <WhatYouCanDo access={access} linked />
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              <FormattedMessage
                id="home.welcome.help"
                defaultMessage="Every page has <b>Help</b> at the top, beside the bell. It explains the page you’re on."
                values={{
                  // The word and its icon are one button, which opens Help
                  // on this page's guide as the bar's does; already open,
                  // it brings that guide back rather than closing it.
                  b: (chunks: ReactNode[]) =>
                    help ? (
                      <Link
                        component="button"
                        type="button"
                        underline="always"
                        onClick={() => {
                          const guide = guideFor(pathname);
                          if (!help.open) help.toggle();
                          else if (guide) help.show(guide);
                        }}
                        sx={{
                          font: 'inherit',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.5,
                          verticalAlign: 'bottom',
                        }}
                      >
                        <HelpOutlineOutlined
                          aria-hidden
                          sx={{ fontSize: '1.15em' }}
                        />
                        {chunks}
                      </Link>
                    ) : (
                      <strong>{chunks}</strong>
                    ),
                }}
              />
            </Typography>
            <Box>
              <Button
                onClick={onDismiss}
                aria-label={intl.formatMessage({
                  id: 'home.welcome.dismissLabel',
                  defaultMessage: 'Dismiss the welcome card',
                })}
                sx={TONAL}
              >
                {intl.formatMessage({
                  id: 'home.welcome.dismiss',
                  defaultMessage: 'Dismiss',
                })}
              </Button>
            </Box>
          </Stack>
        </Box>
      )}
    </Paper>
  );
}

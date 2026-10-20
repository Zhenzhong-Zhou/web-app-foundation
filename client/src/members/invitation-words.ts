import type { IntlShape } from 'react-intl';

import type { ErrorDetails, Invitation } from '../api/types.gen';
import { hasCode } from '../lib/api';
import { formatDayShort } from '../lib/format';
import { organizationDayOf, organizationToday } from '../lib/time-zone';

/**
 * How an invitation's link stands, as Invited shows it (ADR-077): out by
 * email or by a copied link until its last day, an email that did not go,
 * or ended without being accepted. Its last day is the organization's.
 */
export function linkStatusLabel(
  link: Invitation['link'],
  intl: IntlShape,
): string {
  const day = link.lastDay ? formatDayShort(link.lastDay) : '';
  switch (link.status) {
    case 'emailed':
      return intl.formatMessage(
        {
          id: 'members.invited.emailed',
          defaultMessage: 'Emailed · until {day}',
        },
        { day },
      );
    case 'copied':
      return intl.formatMessage(
        {
          id: 'members.invited.copied',
          defaultMessage: 'Link copied · until {day}',
        },
        { day },
      );
    case 'notSent':
      return intl.formatMessage({
        id: 'members.invited.notSent',
        defaultMessage: 'Email not sent',
      });
    case 'ended':
      return intl.formatMessage(
        {
          id: 'members.invited.ended',
          defaultMessage: 'Ended {day}, not accepted',
        },
        { day },
      );
  }
}

/**
 * The day an invitation was made, as the organization counts days
 * (ADR-072): "today", or the day itself.
 */
function invitedDay(invitation: Invitation, intl: IntlShape): string {
  const day = organizationDayOf(invitation.invitedAt);
  return day === organizationToday()
    ? intl.formatMessage({
        id: 'members.invited.today',
        defaultMessage: 'today',
      })
    : formatDayShort(day);
}

/** "Invited by Mei Lin, today", or "by you" for the reader's own. */
export function invitedByLabel(
  invitation: Invitation,
  selfId: string | undefined,
  intl: IntlShape,
): string {
  return intl.formatMessage(
    {
      id: 'members.invited.by',
      defaultMessage:
        'Invited by {self, select, yes {you} other {{name}}}, {when}',
    },
    {
      self: invitation.invitedBy.id === selfId ? 'yes' : 'no',
      name: invitation.invitedBy.name,
      when: invitedDay(invitation, intl),
    },
  );
}

/**
 * An earlier invitation of the address, said where the Email field is
 * refused (already_invited): when and by whom, and how its link stands,
 * never a last day gone by.
 */
export function alreadyInvitedLabel(
  invitation: Invitation,
  selfId: string | undefined,
  intl: IntlShape,
): string {
  const day = organizationDayOf(invitation.invitedAt);
  const values = {
    today: day === organizationToday() ? 'yes' : 'no',
    date: formatDayShort(day),
    self: invitation.invitedBy.id === selfId ? 'yes' : 'no',
    name: invitation.invitedBy.name,
    lastDay: invitation.link.lastDay
      ? formatDayShort(invitation.link.lastDay)
      : '',
  };
  switch (invitation.link.status) {
    case 'notSent':
      return intl.formatMessage(
        {
          id: 'members.invite.alreadyInvited.notSent',
          defaultMessage:
            'Invited {today, select, yes {today} other {on {date}}} by {self, select, yes {you} other {{name}}}. We couldn’t send its email.',
        },
        values,
      );
    case 'ended':
      return intl.formatMessage(
        {
          id: 'members.invite.alreadyInvited.ended',
          defaultMessage:
            'Invited {today, select, yes {today} other {on {date}}} by {self, select, yes {you} other {{name}}}. Its link ended on {lastDay}.',
        },
        values,
      );
    default:
      return intl.formatMessage(
        {
          id: 'members.invite.alreadyInvited.live',
          defaultMessage:
            'Invited {today, select, yes {today} other {on {date}}} by {self, select, yes {you} other {{name}}}. Its link works until {lastDay}.',
        },
        values,
      );
  }
}

/**
 * The day's 50 links made (invitations_daily_limit): when the next can be,
 * in the reader's own time (ADR-077), from the moment the server gives.
 */
export function dailyLimitLabel(
  organizationName: string,
  at: string,
  intl: IntlShape,
): string {
  return intl.formatMessage(
    {
      id: 'members.invite.dailyLimit',
      defaultMessage:
        '{organization} has made 50 invitation links in the last 24 hours, the most allowed. You can invite again from {time}.',
    },
    {
      organization: organizationName,
      time: intl.formatTime(at, { timeStyle: 'short' }),
    },
  );
}

/**
 * A refusal of an invitation's link in words, wherever a link is made:
 * the daily limit in the reader's own time (ADR-077), anything else as
 * the server says it.
 */
export function refusalLabel(
  refusal: {
    message: string;
    code: string | null;
    details: ErrorDetails | null;
  },
  organizationName: string,
  intl: IntlShape,
): string {
  return hasCode(refusal.code, 'invitations_daily_limit') && refusal.details?.at
    ? dailyLimitLabel(organizationName, refusal.details.at, intl)
    : refusal.message;
}

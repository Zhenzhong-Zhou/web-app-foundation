import { t, type Translatable } from '../../i18n/translate';
import type { Mail } from '../../shared/mail/mail.service';
import { compose, dayOf, type DeletionMailContext } from './deletion-mail';

/**
 * The emails every member of an organization gets about its deletion
 * (ADR-070), each in the member's language. What a member reads depends on
 * who they are in it: an Owner is told about the export, and the only
 * member whose account goes with the organization is told so.
 */

/** What the reader is to the organization being deleted. */
export interface MemberSide {
  isOwner: boolean;
  /** The only member, whose account was scheduled with it. */
  withAccount: boolean;
}

/** Every member's banner names the day, so the link is the app itself. */
const APP = '/';

/** Who can cancel, and until when: said when scheduled, and a week before. */
const UNTIL = t({
  id: 'mail.organizationDeletion.scheduled.until',
  defaultMessage:
    'Until then everyone can keep working as usual. Only an Owner can cancel the deletion, until that day is over.',
});

/** For every member but an only one whose account goes too. */
function accountStays(organization: string): Translatable {
  return t(
    {
      id: 'mail.organizationDeletion.scheduled.account',
      defaultMessage:
        'Your account stays: only your membership of {organization} ends.',
    },
    { organization },
  );
}

/** The deletion is scheduled: by whom, after which day, and what follows. */
export function organizationDeletionScheduledMail(
  context: DeletionMailContext,
  details: { organization: string; actor: string; day: string },
  side: MemberSide,
): Mail {
  const date = dayOf(details.day, context.locale);
  const { organization, actor } = details;
  const paragraphs: Translatable[] = [
    t(
      {
        id: 'mail.organizationDeletion.scheduled.when',
        defaultMessage:
          '{actor} asked for {organization} to be deleted. Its records, files and audit log will be deleted after {date}.',
      },
      { actor, organization, date },
    ),
    UNTIL,
  ];

  if (side.isOwner) {
    paragraphs.push(
      t({
        id: 'mail.organizationDeletion.scheduled.export',
        defaultMessage:
          'Download the export again shortly before then, from Settings: once the organization is deleted, nothing can make one.',
      }),
    );
  }
  paragraphs.push(
    side.withAccount
      ? t({
          id: 'mail.organizationDeletion.scheduled.withAccount',
          defaultMessage:
            'Your account will be deleted straight after it, and every other device has been signed out.',
        })
      : accountStays(organization),
  );

  return compose(
    context,
    t(
      {
        id: 'mail.organizationDeletion.scheduled.subject',
        defaultMessage: '{organization} will be deleted after {date}',
      },
      { organization, date },
    ),
    paragraphs,
    APP,
  );
}

/** The deletion was cancelled, and by whom. */
export function organizationDeletionCancelledMail(
  context: DeletionMailContext,
  details: { organization: string; actor: string },
  side: MemberSide,
): Mail {
  const { organization, actor } = details;
  const paragraphs: Translatable[] = [
    t(
      {
        id: 'mail.organizationDeletion.cancelled.body',
        defaultMessage:
          '{actor} cancelled the deletion of {organization}. It stays as it is.',
      },
      { actor, organization },
    ),
  ];
  if (side.withAccount) {
    paragraphs.push(
      t({
        id: 'mail.organizationDeletion.cancelled.withAccount',
        defaultMessage: 'Your account will not be deleted either.',
      }),
    );
  }

  return compose(
    context,
    t(
      {
        id: 'mail.organizationDeletion.cancelled.subject',
        defaultMessage: '{organization} will not be deleted',
      },
      { organization },
    ),
    paragraphs,
    APP,
  );
}

/** The deletion is done. */
export function organizationDeletedMail(
  context: DeletionMailContext,
  details: { organization: string; day: string },
  side: MemberSide,
): Mail {
  const date = dayOf(details.day, context.locale);
  const { organization } = details;

  return compose(
    context,
    t(
      {
        id: 'mail.organizationDeletion.done.subject',
        defaultMessage: '{organization} has been deleted',
      },
      { organization },
    ),
    [
      t(
        {
          id: 'mail.organizationDeletion.done.body',
          defaultMessage:
            '{organization} and everything in it were deleted, as asked, after {date}.',
        },
        { organization, date },
      ),
      side.withAccount
        ? t({
            id: 'mail.organizationDeletion.done.withAccount',
            defaultMessage:
              'Your account is being deleted with it, so this is the last email you will get from us.',
          })
        : t({
            id: 'mail.organizationDeletion.done.account',
            defaultMessage:
              'Your account stays. Sign in to work in another organization you belong to, or to download your own data.',
          }),
    ],
    APP,
  );
}

/**
 * Seven days before the day (ADR-070, amended): the last week's notice,
 * Owners told to download everything again while they still can. It names
 * the day rather than counting to it: on a server that slept through the
 * week, it goes out late, and a count would be wrong.
 */
export function organizationDeletionReminderMail(
  context: DeletionMailContext,
  details: { organization: string; day: string },
  side: MemberSide,
): Mail {
  const date = dayOf(details.day, context.locale);
  const { organization } = details;
  const paragraphs: Translatable[] = [
    t(
      {
        id: 'mail.organizationDeletion.reminder.when',
        defaultMessage:
          '{organization} will be deleted after {date}, with its records, files and audit log.',
      },
      { organization, date },
    ),
    UNTIL,
  ];
  if (side.isOwner) {
    paragraphs.push(
      t({
        id: 'mail.organizationDeletion.reminder.export',
        defaultMessage:
          'Download everything again now, from Settings, so your copy holds the last week too: once the organization is deleted, nothing can make one.',
      }),
    );
  }
  paragraphs.push(
    side.withAccount
      ? t({
          id: 'mail.organizationDeletion.reminder.withAccount',
          defaultMessage: 'Your account will be deleted straight after it.',
        })
      : accountStays(organization),
  );

  return compose(
    context,
    t(
      {
        id: 'mail.organizationDeletion.reminder.subject',
        defaultMessage: 'Reminder: {organization} will be deleted after {date}',
      },
      { organization, date },
    ),
    paragraphs,
    APP,
  );
}

import { t, type Translatable } from '../../i18n/translate';
import type { MailContent } from '../../shared/mail/mail-layout';
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
  /** The person who asked or cancelled: told "you", not their own name. */
  isActor?: boolean;
}

/**
 * Where the email leads: an Owner to Settings → Organization, where the
 * download and the cancel are; everyone else to the app, whose banner
 * names the day.
 */
function linkFor(side: MemberSide): string {
  return side.isOwner ? '/settings/organization' : '/';
}

/** Who can cancel, and until when: said when scheduled, and a week before. */
const UNTIL = t({
  id: 'mail.organizationDeletion.scheduled.until',
  defaultMessage:
    'Until then everyone can keep working as usual. Only an Owner can cancel the deletion, until that day is over.',
});

/** To the only member, who has no one to keep working with, and keeps both. */
const UNTIL_BOTH = t({
  id: 'mail.organizationDeletion.scheduled.untilBoth',
  defaultMessage:
    'Until then you can keep working as usual. To keep both, press Keep both in the banner at the top of every page, until that day is over.',
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

/**
 * The notice of a deletion to come, when scheduled and a week before: when,
 * who can cancel, the export for an Owner, and what becomes of the
 * reader's account. Only the wording differs between the two.
 */
function notice(
  context: DeletionMailContext,
  side: MemberSide,
  organization: string,
  wording: {
    subject: Translatable;
    when: Translatable;
    exportAgain: Translatable;
    withAccount: Translatable;
  },
): MailContent {
  return compose(
    context,
    wording.subject,
    [
      wording.when,
      side.withAccount ? UNTIL_BOTH : UNTIL,
      ...(side.isOwner ? [wording.exportAgain] : []),
      side.withAccount ? wording.withAccount : accountStays(organization),
    ],
    linkFor(side),
  );
}

/** The deletion is scheduled: by whom, after which day, and what follows. */
export function organizationDeletionScheduledMail(
  context: DeletionMailContext,
  details: { organization: string; actor: string; day: string },
  side: MemberSide,
): MailContent {
  const date = dayOf(details.day, context.locale);
  const { organization, actor } = details;

  return notice(context, side, organization, {
    subject: side.withAccount
      ? t(
          {
            id: 'mail.organizationDeletion.scheduled.subjectBoth',
            defaultMessage:
              'Your account and {organization} will be deleted after {date}',
          },
          { organization, date },
        )
      : t(
          {
            id: 'mail.organizationDeletion.scheduled.subject',
            defaultMessage: '{organization} will be deleted after {date}',
          },
          { organization, date },
        ),
    when: side.isActor
      ? t(
          {
            id: 'mail.organizationDeletion.scheduled.whenYou',
            defaultMessage:
              'You asked for {organization} to be deleted. Its records, files and audit log will be deleted after {date}.',
          },
          { organization, date },
        )
      : t(
          {
            id: 'mail.organizationDeletion.scheduled.when',
            defaultMessage:
              '{actor} asked for {organization} to be deleted. Its records, files and audit log will be deleted after {date}.',
          },
          { actor, organization, date },
        ),
    exportAgain: t({
      id: 'mail.organizationDeletion.scheduled.export',
      defaultMessage:
        'Download everything again shortly before then, from Settings → Organization: once the organization is deleted, nothing can make a copy.',
    }),
    withAccount: t({
      id: 'mail.organizationDeletion.scheduled.withAccount',
      defaultMessage:
        'Your account will be deleted straight after it, and every other device has been signed out.',
    }),
  });
}

/** The deletion was cancelled, and by whom. */
export function organizationDeletionCancelledMail(
  context: DeletionMailContext,
  details: { organization: string; actor: string },
  side: MemberSide,
): MailContent {
  const { organization, actor } = details;
  const paragraphs: Translatable[] = [
    side.isActor
      ? t(
          {
            id: 'mail.organizationDeletion.cancelled.bodyYou',
            defaultMessage:
              'You cancelled the deletion of {organization}. It stays as it is.',
          },
          { organization },
        )
      : t(
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
    linkFor(side),
  );
}

/** The deletion is done. */
export function organizationDeletedMail(
  context: DeletionMailContext,
  details: { organization: string; day: string },
  side: MemberSide,
): MailContent {
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
    // The organization is gone: the app, where the account still is.
    '/',
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
): MailContent {
  const date = dayOf(details.day, context.locale);
  const { organization } = details;

  return notice(context, side, organization, {
    subject: side.withAccount
      ? t(
          {
            id: 'mail.organizationDeletion.reminder.subjectBoth',
            defaultMessage:
              'Reminder: your account and {organization} will be deleted after {date}',
          },
          { organization, date },
        )
      : t(
          {
            id: 'mail.organizationDeletion.reminder.subject',
            defaultMessage:
              'Reminder: {organization} will be deleted after {date}',
          },
          { organization, date },
        ),
    when: t(
      {
        id: 'mail.organizationDeletion.reminder.when',
        defaultMessage:
          '{organization} will be deleted after {date}, with its records, files and audit log.',
      },
      { organization, date },
    ),
    exportAgain: t({
      id: 'mail.organizationDeletion.reminder.export',
      defaultMessage:
        'Download everything again now, from Settings → Organization, so your copy holds the last week too: once the organization is deleted, nothing can make one.',
    }),
    withAccount: t({
      id: 'mail.organizationDeletion.reminder.withAccount',
      defaultMessage: 'Your account will be deleted straight after it.',
    }),
  });
}

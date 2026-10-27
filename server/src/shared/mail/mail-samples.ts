import type { ConfigService } from '@nestjs/config';

import { ERROR_CODES } from '../../common/error-codes';
import { type Locale, SUPPORTED_LOCALES } from '../../common/locales';
import type { Env } from '../../config/env';
import { refusalMessage } from '../../core/auth/account-deletion.service';
import {
  passwordResetMail,
  verificationMail,
} from '../../core/auth/account-mail';
import {
  deletionBlockedMail,
  deletionCancelledMail,
  type DeletionMailContext,
  deletionScheduledMail,
} from '../../core/auth/deletion-mail';
import {
  type MemberSide,
  organizationDeletedMail,
  organizationDeletionCancelledMail,
  organizationDeletionReminderMail,
  organizationDeletionScheduledMail,
} from '../../core/auth/organization-deletion-mail';
import { buildSecurityMail } from '../../core/auth/security-mail';
import { roleWords } from '../../core/authorization/role-words';
import { invitationMail } from '../../core/invitations/invitation-mail';
import { organizationStartedMail } from '../../core/invitations/operator-mail';
import type { Mail, MailService } from './mail.service';
import { MailBrand } from './mail-brand';
import type { MailContent } from './mail-layout';

/** One email in one language, as the preview writes it and the proof reads it. */
export interface MailSample {
  /** Its files' name, as `confirm-email.zh-Hans.txt`. */
  name: string;
  locale: Locale;
  mail: Mail;
}

/** The dev client, as .env.example's CLIENT_URL: it serves the mark too. */
const CLIENT_URL = 'http://localhost:5173';
/** As .env.example's MAIL_FROM: Panivo heads the product's emails. */
const MAIL_FROM = 'Panivo <no-reply@localhost>';
/** No token works: the samples' links open pages that refuse it. */
const TOKEN = 'sample-token';

const ORGANIZATION = 'Northside Naturals';
const READER = { name: 'Mei Lin', to: 'mei.lin@example.com' };
const INVITER = { name: 'Chen Jie', email: 'chen.jie@example.com' };
const AT = new Date('2026-10-26T22:41:07Z');
const DELETION_DAY = '2026-11-25';
/** An Owner who did not ask: told of the export, and of who asked. */
const OWNER: MemberSide = { isOwner: true, withAccount: false };

/**
 * Every email the app sends (ADR-083), in each language it is sent in, the
 * operator's in English, each from its own builder with fixed values: no
 * database, no clock and no real token, so the same call always writes the
 * same emails. The product's emails go through MailBrand.send, as the
 * services send them, with the mark served; the invitation, the
 * organization's, as InvitationsService hands it to MailService.
 */
export async function mailSamples(): Promise<MailSample[]> {
  const settings: Partial<Env> = { MAIL_FROM, CLIENT_URL };
  const config = {
    get: (key: keyof Env) => settings[key],
  } as unknown as ConfigService<Env, true>;
  const sent: Mail[] = [];
  const transport = {
    send: (mail: Mail) => {
      sent.push(mail);
      return Promise.resolve();
    },
  } as unknown as MailService;
  const brand = new MailBrand(config, () => Promise.resolve(true), transport);
  await brand.check();

  /** The product's email as MailBrand.send passes it on. */
  const branded = async (content: MailContent | null): Promise<Mail> => {
    await brand.send(content!);
    return sent.pop()!;
  };

  const emails: {
    name: string;
    locales?: readonly Locale[];
    build: (locale: Locale) => Promise<Mail>;
  }[] = [
    {
      name: 'confirm-email',
      build: (locale) =>
        branded(verificationMail({ ...reader(locale), token: TOKEN })),
    },
    {
      name: 'reset-password',
      build: (locale) =>
        branded(passwordResetMail({ ...reader(locale), token: TOKEN })),
    },
    {
      name: 'security-sign-in',
      build: (locale) =>
        branded(buildSecurityMail('session.created', security(locale))),
    },
    {
      name: 'security-password-changed',
      build: (locale) =>
        branded(
          buildSecurityMail('account.password_changed', security(locale)),
        ),
    },
    {
      name: 'security-password-reset',
      build: (locale) =>
        branded(buildSecurityMail('account.password_reset', security(locale))),
    },
    {
      name: 'account-deletion-scheduled',
      build: (locale) =>
        branded(deletionScheduledMail(reader(locale), DELETION_DAY)),
    },
    {
      name: 'account-deletion-cancelled',
      build: (locale) => branded(deletionCancelledMail(reader(locale))),
    },
    {
      name: 'account-deletion-blocked',
      build: (locale) =>
        branded(
          deletionBlockedMail(
            reader(locale),
            refusalMessage({
              code: ERROR_CODES.lastOwnerWithMembers,
              organizationId: '00000000-0000-0000-0000-000000000000',
              organizationName: ORGANIZATION,
              goingToo: false,
            }),
          ),
        ),
    },
    {
      name: 'organization-deletion-scheduled',
      build: (locale) =>
        branded(
          organizationDeletionScheduledMail(
            reader(locale),
            {
              organization: ORGANIZATION,
              actor: INVITER.name,
              day: DELETION_DAY,
            },
            OWNER,
          ),
        ),
    },
    {
      name: 'organization-deletion-cancelled',
      build: (locale) =>
        branded(
          organizationDeletionCancelledMail(
            reader(locale),
            { organization: ORGANIZATION, actor: INVITER.name },
            OWNER,
          ),
        ),
    },
    {
      name: 'organization-deletion-reminder',
      build: (locale) =>
        branded(
          organizationDeletionReminderMail(
            reader(locale),
            { organization: ORGANIZATION, day: DELETION_DAY },
            OWNER,
          ),
        ),
    },
    {
      name: 'organization-deleted',
      build: (locale) =>
        branded(
          organizationDeletedMail(
            reader(locale),
            { organization: ORGANIZATION, day: DELETION_DAY },
            OWNER,
          ),
        ),
    },
    {
      name: 'operator-organization-started',
      locales: ['en'],
      build: () =>
        branded(
          organizationStartedMail({
            to: 'operator@example.com',
            organizationName: ORGANIZATION,
            name: INVITER.name,
            email: INVITER.email,
            at: AT,
            // As every acceptance: org:invite's printed link confirms nothing.
            verified: false,
          }),
        ),
    },
    {
      name: 'invitation',
      build: (locale) =>
        Promise.resolve(
          invitationMail({
            locale,
            to: READER.to,
            inviter: INVITER,
            organizationName: ORGANIZATION,
            roles: [
              roleWords(
                { name: 'Admin', description: null, isSystem: true },
                locale,
              ),
            ],
            system: 'Admin',
            note: 'Start at the North site on Monday.\nBring boots: the cold room is cold.',
            timeZone: 'America/Vancouver',
            lastDay: '2026-11-02',
            link: `${CLIENT_URL}/invitation?token=${TOKEN}`,
            appName: brand.name,
          }),
        ),
    },
  ];

  const samples: MailSample[] = [];
  for (const { name, locales = SUPPORTED_LOCALES, build } of emails) {
    for (const locale of locales) {
      samples.push({ name, locale, mail: await build(locale) });
    }
  }
  return samples;
}

/** The reader, in a language. */
function reader(locale: Locale): DeletionMailContext {
  return { locale, to: READER.to, name: READER.name, clientUrl: CLIENT_URL };
}

/** A sign-in from Chrome on macOS, at a fixed time. */
function security(locale: Locale) {
  return {
    ...reader(locale),
    ip: '203.0.113.7',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    at: AT,
  };
}

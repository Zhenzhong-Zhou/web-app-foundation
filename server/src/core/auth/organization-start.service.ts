import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';

import { ERROR_CODES, withCode } from '../../common/error-codes';
import type { Database } from '../../database/database.module';
import { UNSAFE_GLOBAL_DB } from '../../database/database.tokens';
import { t } from '../../i18n/translate';
import {
  holdAccount,
  startOrganization,
} from '../organizations/start-organization';
import { AccountEventService, type EventMeta } from './account-event.service';
import type { AuthenticatedUser } from './auth.service';
import type { StartOrganizationDto } from './dto/start-organization.dto';
import type { RequestContext } from './request-context';
import { SessionService } from './session.service';

/**
 * Start an organization (ADR-078): an account with no organization, having
 * left one or seen it closed, makes a new one and becomes its Owner, where
 * registration is open; the route's guard refuses it otherwise. This is
 * ADR-070's deferred "starting a new organization from an existing
 * account", beside accepting an organization invitation, which does the
 * same by invitation.
 *
 * In core/auth with account deletion: an account's act, with no
 * organization to scope to until it has run.
 */
@Injectable()
export class OrganizationStartService {
  private readonly logger = new Logger(OrganizationStartService.name);

  constructor(
    @Inject(UNSAFE_GLOBAL_DB) private readonly db: Database,
    private readonly sessions: SessionService,
    private readonly events: AccountEventService,
  ) {}

  async start(
    context: RequestContext,
    dto: StartOrganizationDto,
    meta: EventMeta,
  ): Promise<AuthenticatedUser> {
    const { account, organizationId } = await this.db.transaction(
      async (tx) => {
        const { account, belongs } = await holdAccount(tx, context.userId);

        if (belongs) {
          throw new ConflictException(
            t({
              id: 'auth.start.alreadyMember',
              defaultMessage:
                'Your account already belongs to an organization, and an account can belong to only one for now. Leave it first, then start a new one.',
            }),
          );
        }
        if (account.deletionScheduledAt) {
          const day = account.deletionScheduledAt;
          throw new ConflictException(
            withCode(
              t(
                {
                  id: 'auth.start.deletionScheduled',
                  defaultMessage:
                    'Your account is set to be deleted after {day}. Keep your account, then start an organization.',
                },
                { day },
              ),
              ERROR_CODES.accountDeletionScheduled,
              { day },
            ),
          );
        }

        const organizationId = await startOrganization(tx, {
          name: dto.name,
          timeZone: dto.timeZone,
          userId: context.userId,
        });
        return { account, organizationId };
      },
    );

    await this.sessions.setCurrentOrg(context.sessionId, organizationId);
    await this.events.record(
      context.userId,
      'account.organization_started',
      meta,
    );
    this.logger.log(`${context.userId} started ${organizationId}`);

    return {
      id: context.userId,
      email: account.email,
      name: account.name,
      emailVerified: account.emailVerifiedAt !== null,
      locale: account.locale,
      organizationId,
    };
  }
}

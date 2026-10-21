import { Module } from '@nestjs/common';

import { MailModule } from '../../shared/mail/mail.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InvitationAcceptanceService } from './invitation-acceptance.service';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { InvitationsSweepService } from './invitations-sweep.service';
import { InvitationsSweepTimer } from './invitations-sweep.timer';
import { OrganizationInvitationAcceptanceService } from './organization-invitation-acceptance.service';

@Module({
  // AuthModule for the tokens, sessions, passwords and account events an
  // acceptance writes; FilesModule for the storage the logo is read from;
  // AuditModule for the acceptance, recorded by hand (ADR-077);
  // NotificationsModule to tell the inviter (ADR-079).
  imports: [
    AuthModule,
    AuditModule,
    FilesModule,
    MailModule,
    NotificationsModule,
  ],
  controllers: [InvitationsController],
  providers: [
    InvitationsService,
    InvitationAcceptanceService,
    OrganizationInvitationAcceptanceService,
    InvitationsSweepService,
    InvitationsSweepTimer,
  ],
})
export class InvitationsModule {}

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { MailModule } from '../../shared/mail/mail.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { AccountDeletionService } from './account-deletion.service';
import { AccountDeletionTimer } from './account-deletion.timer';
import { AccountEventService } from './account-event.service';
import { AccountPhotoService } from './account-photo.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { OrganizationDeletionController } from './organization-deletion.controller';
import { OrganizationDeletionService } from './organization-deletion.service';
import { OrganizationDeletionTimer } from './organization-deletion.timer';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { SessionContextMiddleware } from './session-context.middleware';

@Module({
  // FilesModule for the storage a person's photo goes to (ADR-063).
  imports: [AuthorizationModule, FilesModule, MailModule, NotificationsModule],
  controllers: [
    AuthController,
    AccountController,
    OrganizationDeletionController,
  ],
  providers: [
    AuthService,
    AuthTokenService,
    PasswordService,
    SessionService,
    SessionContextMiddleware,
    AccountService,
    AccountEventService,
    AccountPhotoService,
    AccountDeletionService,
    AccountDeletionTimer,
    // Deleting an organization (ADR-070) lives beside deleting an account:
    // they share the deletion day, the emails and the only member's account.
    OrganizationDeletionService,
    OrganizationDeletionTimer,
  ],
  // Exported for the guard, and for password-change flows that must revoke
  // other sessions (ADR-011). AuthTokenService is exported so admin-created
  // users can be issued a verification token from core/users.
  exports: [SessionService, PasswordService, AuthTokenService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Every route, including public ones: a logged-in user hitting /v1/auth/login
    // should still have their old session available to rotate.
    consumer.apply(SessionContextMiddleware).forRoutes('*');
  }
}

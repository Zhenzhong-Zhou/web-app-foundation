import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { MailModule } from '../../shared/mail/mail.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { SessionContextMiddleware } from './session-context.middleware';

@Module({
  imports: [AuthorizationModule, MailModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTokenService,
    PasswordService,
    SessionService,
    SessionContextMiddleware,
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

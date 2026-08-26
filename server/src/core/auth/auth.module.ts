import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { SessionContextMiddleware } from './session-context.middleware';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, SessionService],
  // Exported for the guard in the next step, and for password-change flows
  // that must revoke other sessions (ADR-011).
  exports: [SessionService, PasswordService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Every route, including public ones: a logged-in user hitting /v1/auth/login
    // should still have their old session available to rotate.
    consumer.apply(SessionContextMiddleware).forRoutes('*');
  }
}

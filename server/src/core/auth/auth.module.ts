import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, SessionService],
  // Exported for the guard in the next step, and for password-change flows
  // that must revoke other sessions (ADR-011).
  exports: [SessionService, PasswordService],
})
export class AuthModule {}

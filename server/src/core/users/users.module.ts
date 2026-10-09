import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  // For PasswordService, which AuthModule already exports; and the
  // caller's permissions, for how exact last active may be (ADR-063).
  imports: [AuthModule, AuthorizationModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}

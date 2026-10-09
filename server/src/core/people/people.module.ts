import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { FilesModule } from '../files/files.module';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';
import { WorkController } from './work.controller';
import { WorkService } from './work.service';

/** People and you at work (ADR-063). */
@Module({
  imports: [AuditModule, AuthorizationModule, FilesModule],
  controllers: [PeopleController, WorkController],
  providers: [PeopleService, WorkService],
})
export class PeopleModule {}

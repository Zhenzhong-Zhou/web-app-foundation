import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env';
import { AuthorizationModule } from '../authorization/authorization.module';
import { FILE_STORAGE } from './file-storage';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { FilesPurgeService } from './files-purge.service';
import { FilesPurgeTimer } from './files-purge.timer';
import { storageFromConfig } from './storage-from-config';

/**
 * Files (ADR-059). FilesService for the features that attach them; the
 * storage itself for a person's photo (ADR-063), which no organization
 * owns.
 */
@Module({
  imports: [AuthorizationModule],
  controllers: [FilesController],
  providers: [
    {
      provide: FILE_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        storageFromConfig(config),
    },
    FilesService,
    FilesPurgeService,
    FilesPurgeTimer,
  ],
  exports: [FilesService, FILE_STORAGE],
})
export class FilesModule {}

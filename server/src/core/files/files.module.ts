import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env';
import { AuthorizationModule } from '../authorization/authorization.module';
import { FILE_STORAGE } from './file-storage';
import { FilesPurgeTimer } from './files-purge.timer';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { storageFromConfig } from './storage-from-config';

/** Files (ADR-059). Exported for the features that attach them. */
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
    FilesPurgeTimer,
  ],
  exports: [FilesService],
})
export class FilesModule {}

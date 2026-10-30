import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { trackerEnvironment } from '../common/faults/tracker';
import type { Env } from '../config/env';
import { ErrorsController } from './errors.controller';
import {
  ErrorsService,
  TRACKER_PROJECT,
  type TrackerProject,
} from './errors.service';

@Module({
  controllers: [ErrorsController],
  providers: [
    ErrorsService,
    {
      provide: TRACKER_PROJECT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): TrackerProject => ({
        dsn: config.get('ERROR_TRACKER_DSN', { infer: true }),
        environment: trackerEnvironment({
          ERROR_TRACKER_ENVIRONMENT: config.get('ERROR_TRACKER_ENVIRONMENT', {
            infer: true,
          }),
          NODE_ENV: config.get('NODE_ENV', { infer: true }),
        }),
      }),
    },
  ],
})
export class ErrorsModule {}

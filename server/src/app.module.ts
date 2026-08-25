import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Resolved against process.cwd(), which is server/ when you run
      // `npm run start:dev`. One .env at the repo root serves both Nest
      // and docker compose — see README, "Repository layout".
      envFilePath: '../.env',
      validate: validateEnv,
      cache: true,
    }),
    HealthModule,
  ],
})
export class AppModule {}
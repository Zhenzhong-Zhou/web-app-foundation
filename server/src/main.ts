import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import type { Env } from './config/env';

async function bootstrap() {
    // bufferLogs holds early boot logs until pino replaces the default logger,
    // so nothing is emitted in two different formats.
    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    app.useLogger(app.get(Logger));
    
    configureApp(app);
    
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
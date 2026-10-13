import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { configureApp } from '../bootstrap';
import { apiDocument } from './api-document';

/**
 * Writes server/openapi.json (ADR-068). Run through `npm run api:spec`,
 * which builds first: the CLI plugin's description of each DTO exists only
 * in the compiled output.
 *
 * Boots the application's modules without listening and without reaching
 * the database, whose pool connects on its first query. The environment is
 * read and checked as for a real start, so it needs the same .env.
 */
async function writeSpec(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);

  const document = apiDocument(app);
  const file = join(__dirname, '..', '..', 'openapi.json');
  await writeFile(file, `${JSON.stringify(document, null, 2)}\n`);

  await app.close();
}

void writeSpec();

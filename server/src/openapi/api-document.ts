import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';

import { ApiVocabulary } from './api-vocabulary';
import { ErrorBody } from './error-body';

/**
 * The API's OpenAPI document (ADR-068), built from the application's routes
 * and DTOs. write-openapi.ts writes it to server/openapi.json; it is never
 * served.
 */
export function apiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('web-app-foundation API')
    .setVersion('1')
    .setOpenAPIVersion('3.1.0')
    .build();

  return SwaggerModule.createDocument(app, config, {
    extraModels: [ApiVocabulary, ErrorBody],
  });
}

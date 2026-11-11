import {
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
  UseFilters,
} from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiQuery } from '@nestjs/swagger';
import type { Request } from 'express';

import { SUPPORTED_LOCALES } from '../../common/locales';
import type { DocumentPage } from './refusal-page';
import { RefusalPageFilter } from './refusal-page.filter';

/**
 * A route that answers with a document's PDF (ADR-071), as the API
 * document describes it: inline for Print, an attachment with ?download=1
 * for Download PDF.
 *
 * A refusal opened from the link answers with a page instead of the JSON
 * (ADR-071, amended for #526): `page` is the document's own page in the
 * app, its way back, filled from the route's own parameters; required, so
 * no PDF route can leave a refusal without one. `?locale=` is the app's
 * language for that page, which the PDF itself ignores: a document prints
 * in its customer's languages.
 */
export const PdfResponse = (page: DocumentPage) =>
  applyDecorators(
    ApiProduces('application/pdf'),
    ApiQuery({ name: 'download', required: false, enum: ['1'] }),
    ApiQuery({ name: 'locale', required: false, enum: SUPPORTED_LOCALES }),
    ApiOkResponse({ schema: { type: 'string', format: 'binary' } }),
    UseFilters(new RefusalPageFilter(page)),
  );

/** Whether Download PDF asked for it: ?download=1, as PdfResponse says. */
export const DownloadAsked = createParamDecorator(
  (_data: unknown, context: ExecutionContext): boolean =>
    context.switchToHttp().getRequest<Request>().query.download === '1',
);

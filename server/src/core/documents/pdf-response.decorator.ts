import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiQuery } from '@nestjs/swagger';

/**
 * A route that answers with a document's PDF (ADR-071), as the API
 * document describes it: inline for Print, an attachment with ?download=1
 * for Download PDF.
 */
export const PdfResponse = () =>
  applyDecorators(
    ApiProduces('application/pdf'),
    ApiQuery({ name: 'download', required: false, enum: ['1'] }),
    ApiOkResponse({ schema: { type: 'string', format: 'binary' } }),
  );

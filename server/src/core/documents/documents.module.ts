import { Module } from '@nestjs/common';

import { PdfRenderer } from './pdf-renderer.service';

/** Documents as PDF, drawn on the server (ADR-071). */
@Module({
  providers: [PdfRenderer],
  exports: [PdfRenderer],
})
export class DocumentsModule {}

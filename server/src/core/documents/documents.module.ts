import { Module } from '@nestjs/common';

import { FilesModule } from '../files/files.module';
import { DocumentsService } from './documents.service';
import { PdfRenderer } from './pdf-renderer.service';

/** Documents as PDF, drawn on the server (ADR-071). */
@Module({
  imports: [FilesModule],
  providers: [PdfRenderer, DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}

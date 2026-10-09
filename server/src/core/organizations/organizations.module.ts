import { Module } from '@nestjs/common';

import { FilesModule } from '../files/files.module';
import { OrganizationController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  // FilesService attaches and releases the logo (ADR-060).
  imports: [FilesModule],
  controllers: [OrganizationController],
  providers: [OrganizationsService],
  // Exported for invoicing, which copies the seller onto an invoice at issue.
  exports: [OrganizationsService],
})
export class OrganizationsModule {}

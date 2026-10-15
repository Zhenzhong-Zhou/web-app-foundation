import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { FilesModule } from '../files/files.module';
import { OrganizationExportService } from './organization-export.service';
import { OrganizationController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  // FilesService attaches and releases the logo (ADR-060); the storage and
  // AuditService for the export (ADR-070).
  imports: [AuditModule, AuthorizationModule, FilesModule],
  controllers: [OrganizationController],
  providers: [OrganizationsService, OrganizationExportService],
  // Exported for invoicing, which copies the seller onto an invoice at issue.
  exports: [OrganizationsService],
})
export class OrganizationsModule {}

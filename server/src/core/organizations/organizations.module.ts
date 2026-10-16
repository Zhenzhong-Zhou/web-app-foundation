import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { FilesModule } from '../files/files.module';
import { ExportContributions } from './export-contributions';
import { OrganizationExportService } from './organization-export.service';
import { OrganizationController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  // FilesService attaches and releases the logo (ADR-060); the storage and
  // AuditService for the export, and PermissionsService for who sees the
  // last one (ADR-070).
  imports: [AuditModule, AuthorizationModule, FilesModule],
  controllers: [OrganizationController],
  providers: [
    OrganizationsService,
    OrganizationExportService,
    ExportContributions,
  ],
  // Exported for invoicing, which copies the seller onto an invoice at issue
  // and adds its documents to the export (ADR-071).
  exports: [OrganizationsService, ExportContributions],
})
export class OrganizationsModule {}

import { Module } from '@nestjs/common';

import { OrganizationController } from './organizations.controller';
import { OrganizationService } from './organizations.service';

@Module({
  controllers: [OrganizationController],
  providers: [OrganizationService],
  // Exported for invoicing, which copies the seller onto an invoice at issue.
  exports: [OrganizationService],
})
export class OrganizationsModule {}

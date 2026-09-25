import { Module } from '@nestjs/common';

import { OrganizationController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  controllers: [OrganizationController],
  providers: [OrganizationsService],
  // Exported for invoicing, which copies the seller onto an invoice at issue.
  exports: [OrganizationsService],
})
export class OrganizationsModule {}

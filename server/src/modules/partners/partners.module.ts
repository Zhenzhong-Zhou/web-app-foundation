import { Module } from '@nestjs/common';

import { PartnerAddressesController } from './partner-addresses.controller';
import { PartnerAddressesService } from './partner-addresses.service';
import { PartnerContactsController } from './partner-contacts.controller';
import { PartnerContactsService } from './partner-contacts.service';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';

/**
 * Exports PartnersService because orders will need to check a partner exists
 * and is active before writing an order against it — a question that belongs
 * here rather than being answered by a second module reading the table
 * directly. The address and contact services are the same argument applied
 * inside this module: both ask PartnersService rather than selecting partners
 * themselves.
 *
 * PartnerAddressesService is exported too. Orders needs to resolve a ship-to
 * address at creation in order to snapshot it (ADR-028), and that lookup is
 * this module's to answer.
 */
@Module({
  controllers: [
    PartnersController,
    PartnerAddressesController,
    PartnerContactsController,
  ],
  providers: [PartnersService, PartnerAddressesService, PartnerContactsService],
  exports: [PartnersService, PartnerAddressesService],
})
export class PartnersModule {}

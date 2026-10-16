import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';

import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { Audited } from '../../core/audit/audited.decorator';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { CreateLocationDto } from './dto/create-location.dto';
import type { CreatedLocation, Location } from './dto/location-response.dto';
import { SiteAddressDto } from './dto/site-address.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationsService } from './locations.service';

/**
 * No delete. A location that has held stock is referenced by movements, and
 * the parent foreign key is RESTRICT — removing a warehouse must not take its
 * bins with it. Retiring one is `isActive: false`, the same shape as products
 * (ADR-023).
 */
@Controller({ path: 'locations', version: '1' })
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.LOCATIONS_VIEW)
  list(): Promise<Location[]> {
    return this.locations.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.LOCATIONS_CREATE)
  @Audited({
    action: AUDIT_ACTIONS.LOCATION_CREATED,
    resourceType: 'location',
    resourceId: (response: { location: { id: string } }) =>
      response.location.id,
  })
  async create(@Body() dto: CreateLocationDto): Promise<CreatedLocation> {
    return { location: await this.locations.create(dto) };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.LOCATIONS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.LOCATION_UPDATED,
    resourceType: 'location',
    resourceId: (_response, request) => request.params.id,
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocationDto,
  ): Promise<void> {
    await this.locations.update(id, dto);
  }

  /**
   * A site's address (ADR-071), where a purchase order is delivered and an
   * RMA's goods come back: sent whole, created or replaced. Audited as a
   * change to the site, with what it now says; a site's address is a
   * business's, not a person's.
   */
  @Put(':id/address')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.LOCATIONS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.LOCATION_UPDATED,
    resourceType: 'location',
    resourceId: (_response, request) => request.params.id,
    fields: ['line1', 'line2', 'city', 'region', 'postalCode', 'country'],
  })
  async setAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SiteAddressDto,
  ): Promise<void> {
    await this.locations.setAddress(id, dto);
  }

  /** The site's address removed: its documents print the registered one. */
  @Delete(':id/address')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.LOCATIONS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.LOCATION_UPDATED,
    resourceType: 'location',
    resourceId: (_response, request) => request.params.id,
  })
  async removeAddress(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.locations.removeAddress(id);
  }
}

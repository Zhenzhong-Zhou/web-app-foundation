import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';

import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { Audited } from '../../core/audit/audited.decorator';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { CreateLocationDto } from './dto/create-location.dto';
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
  list() {
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
  async create(@Body() dto: CreateLocationDto) {
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
}

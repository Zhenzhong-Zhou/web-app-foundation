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
  Query,
} from '@nestjs/common';

import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { Audited } from '../../core/audit/audited.decorator';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { BomsService } from './boms.service';
import { CreateBomDto } from './dto/create-bom.dto';
import { CreateBomLineDto } from './dto/create-bom-line.dto';
import { ListBomsDto } from './dto/list-boms.dto';
import { UpdateBomDto } from './dto/update-bom.dto';
import { UpdateBomLineDto } from './dto/update-bom-line.dto';

@Controller({ path: 'boms', version: '1' })
export class BomsController {
  constructor(private readonly boms: BomsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.BOMS_VIEW)
  list(@Query() query: ListBomsDto) {
    return this.boms.list(query);
  }

  /** The recipe with its lines. The only consumer wants both. */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.BOMS_VIEW)
  find(@Param('id', ParseUUIDPipe) id: string) {
    return this.boms.findDetail(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.BOMS_CREATE)
  @Audited({
    action: AUDIT_ACTIONS.BOM_CREATED,
    resourceType: 'bom',
    resourceId: (response: { bom: { id: string } }) => response.bom.id,
  })
  async create(@Body() dto: CreateBomDto) {
    return { bom: await this.boms.create(dto) };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.BOMS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.BOM_UPDATED,
    resourceType: 'bom',
    resourceId: (_response, request) => request.params.id,
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBomDto,
  ): Promise<void> {
    await this.boms.update(id, dto);
  }

  @Post(':id/lines')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.BOMS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.BOM_LINE_ADDED,
    resourceType: 'bom',
    resourceId: (_response, request) => request.params.id,
  })
  async addLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBomLineDto,
  ) {
    return { line: await this.boms.addLine(id, dto) };
  }

  @Patch(':id/lines/:lineId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.BOMS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.BOM_LINE_UPDATED,
    resourceType: 'bom',
    resourceId: (_response, request) => request.params.id,
  })
  async updateLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: UpdateBomLineDto,
  ): Promise<void> {
    await this.boms.updateLine(id, lineId, dto);
  }

  /**
   * A real delete, unlike almost everything else here.
   *
   * A draft line is not a record of anything that happened — what happened is
   * on the production order, which keeps its own snapshot (ADR-029). Retiring
   * it instead would leave rows a recipe screen has to filter out forever, and
   * the audit entry is the trail.
   */
  @Delete(':id/lines/:lineId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.BOMS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.BOM_LINE_REMOVED,
    resourceType: 'bom',
    resourceId: (_response, request) => request.params.id,
  })
  async removeLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ): Promise<void> {
    await this.boms.removeLine(id, lineId);
  }

  /**
   * Promotion and archiving are POSTs to named sub-routes rather than a status
   * field on PATCH. They are transitions with rules — promotion archives the
   * outgoing version in the same transaction — and a settable `status` would
   * invite a client to move a BOM anywhere, including backwards.
   */
  @Post(':id/promote')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.BOMS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.BOM_PROMOTED,
    resourceType: 'bom',
    resourceId: (_response, request) => request.params.id,
  })
  async promote(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.boms.promote(id);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.BOMS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.BOM_ARCHIVED,
    resourceType: 'bom',
    resourceId: (_response, request) => request.params.id,
  })
  async archive(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.boms.archive(id);
  }

  /**
   * Requires BOMS_CREATE, not BOMS_UPDATE: this makes a new recipe, and the
   * fact that it starts from an old one does not change what the caller ends
   * up holding.
   */
  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.BOMS_CREATE)
  @Audited({
    action: AUDIT_ACTIONS.BOM_CREATED,
    resourceType: 'bom',
    resourceId: (response: { bom: { id: string } }) => response.bom.id,
  })
  async duplicate(@Param('id', ParseUUIDPipe) id: string) {
    return { bom: await this.boms.duplicate(id) };
  }
}

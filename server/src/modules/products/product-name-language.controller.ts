import { Body, Controller, Get, Put, Query } from '@nestjs/common';

import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { Audited } from '../../core/audit/audited.decorator';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import {
  getRequestContext,
  type RequestContext,
} from '../../core/auth/request-context';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import {
  ChooseProductNameLanguageDto,
  ProductNameLanguageQueryDto,
} from './dto/product-name-language.dto';
import type {
  ProductNameLanguageChosen,
  ProductNameLanguagePreview,
} from './dto/product-name-language-response.dto';
import { ProductNameLanguageService } from './product-name-language.service';

/**
 * The language the organization's items are named in, on the Documents
 * tab's Item names section (ADR-054, amended for #531): for those who may
 * change the organization's settings, the preview as much as the choice,
 * since the preview lists the names to choose between.
 */
@Controller({ path: 'organization/product-name-language', version: '1' })
export class ProductNameLanguageController {
  constructor(private readonly names: ProductNameLanguageService) {}

  /** What choosing the language will do, before anything is changed. */
  @Get()
  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_UPDATE)
  preview(
    @Query() query: ProductNameLanguageQueryDto,
  ): Promise<ProductNameLanguagePreview> {
    return this.names.preview(query.language);
  }

  /**
   * The language chosen, with a choice for each name that differs. The
   * organization's entry holds the language from and to and the counts,
   * which the service records; each renamed item's own History, its
   * entry.
   */
  @Put()
  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.ORGANIZATION_UPDATED,
    resourceType: 'organization',
    resourceId: (_response, request) =>
      getRequestContext(request)?.organizationId ?? undefined,
  })
  choose(
    @Body() dto: ChooseProductNameLanguageDto,
    @CurrentUser() context: RequestContext,
  ): Promise<ProductNameLanguageChosen> {
    return this.names.choose(dto, context);
  }
}

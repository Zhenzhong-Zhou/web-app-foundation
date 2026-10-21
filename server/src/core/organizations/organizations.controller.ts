import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';

import { SUPPORTED_LOCALES } from '../../common/locales';
import { AUDIT_ACTIONS } from '../audit/audit-actions';
import { Audited } from '../audit/audited.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  getRequestContext,
  type RequestContext,
} from '../auth/request-context';
import { PERMISSIONS } from '../authorization/permissions';
import { PermissionsService } from '../authorization/permissions.service';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { OrganizationAddressDto } from './dto/organization-address.dto';
import type { OrganizationEnvelope } from './dto/organization-response.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationExportService } from './organization-export.service';
import { OrganizationsService } from './organizations.service';

/**
 * The signed-in organization's own details: what it prints on the documents
 * it issues (ADR-046).
 *
 * Singular, with no id in the path: there is only ever the current
 * organization, taken from the session, so a URL can never name another.
 */
@Controller({ path: 'organization', version: '1' })
export class OrganizationController {
  constructor(
    private readonly organization: OrganizationsService,
    private readonly exports: OrganizationExportService,
    private readonly permissions: PermissionsService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_VIEW)
  async get(
    @CurrentUser() context: RequestContext,
  ): Promise<OrganizationEnvelope> {
    const granted = await this.permissions.listForMember(context.membershipId);
    return {
      organization: await this.organization.get({
        withLastExport: granted.includes(PERMISSIONS.ORGANIZATIONS_EXPORT),
      }),
    };
  }

  /**
   * Everything the organization holds, as one ZIP (ADR-070). Audited by
   * the export itself, before the response ends, rather than by @Audited,
   * which would write after it: a deletion asked for straight after the
   * download must find the entry.
   */
  @Get('export')
  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_EXPORT)
  @ApiProduces('application/zip')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiQuery({ name: 'locale', required: false, enum: SUPPORTED_LOCALES })
  async exportAll(
    @CurrentUser() context: RequestContext,
    @Query('locale') locale: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    // The language the app shows, which a plain link cannot otherwise say
    // (ADR-071); anything else is ignored, as an absent one is.
    const asked = SUPPORTED_LOCALES.find((each) => each === locale);
    await this.exports.writeTo(res, context, asked);
  }

  @Patch()
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.ORGANIZATION_UPDATED,
    resourceType: 'organization',
    resourceId: (_response, request) =>
      getRequestContext(request)?.organizationId ?? undefined,
    fields: [
      // Renaming (ADR-061): the log keeps what it was called before.
      'name',
      'taxRegistrationNumber',
      'baseCurrency',
      'defaultSalePriceListId',
      'licenceNotInForcePolicy',
      'licenceExpiredPolicy',
      'licenceRequired',
      // What documents print in (ADR-054): a change worth seeing in the log,
      // since every document made after it carries the result.
      'documentLanguage',
      'documentSecondLanguage',
      'requiredNameLanguages',
      // What every document is drawn on (ADR-071).
      'paperSize',
      // What decides the organization's day (ADR-072).
      'timeZone',
      // Branding and the expiry days (ADR-060). The accent is logged as
      // sent; the row holds the shade that passed.
      'logoFileId',
      'accentColor',
      'rail',
      'logoOnDocuments',
      'expiryWarningDays',
      'expiryCriticalDays',
      // Sign out after inactivity (ADR-065).
      'idleSignOutMinutes',
      'idleSignOutScope',
    ],
  })
  async update(@Body() dto: UpdateOrganizationDto): Promise<void> {
    await this.organization.update(dto);
  }

  @Put('address')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.ORGANIZATION_ADDRESS_UPDATED,
    resourceType: 'organization',
    resourceId: (_response, request) =>
      getRequestContext(request)?.organizationId ?? undefined,
    // A registered office is public record, not personal data.
    fields: ['line1', 'line2', 'city', 'region', 'postalCode', 'country'],
  })
  async setAddress(@Body() dto: OrganizationAddressDto): Promise<void> {
    await this.organization.setAddress(dto);
  }
}

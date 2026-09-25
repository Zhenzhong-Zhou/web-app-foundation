import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Put,
} from '@nestjs/common';

import { AUDIT_ACTIONS } from '../audit/audit-actions';
import { Audited } from '../audit/audited.decorator';
import { getRequestContext } from '../auth/request-context';
import { PERMISSIONS } from '../authorization/permissions';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { OrganizationAddressDto } from './dto/organization-address.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationService } from './organizations.service';

/**
 * The signed-in organization's own details: what it prints on the documents
 * it issues (ADR-046).
 *
 * Singular, with no id in the path: there is only ever the current
 * organization, taken from the session, so a URL can never name another.
 */
@Controller({ path: 'organization', version: '1' })
export class OrganizationController {
  constructor(private readonly organization: OrganizationService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_VIEW)
  async get() {
    return { organization: await this.organization.get() };
  }

  @Patch()
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.ORGANIZATION_UPDATED,
    resourceType: 'organization',
    resourceId: (_response, request) =>
      getRequestContext(request)?.organizationId ?? undefined,
    fields: ['taxRegistrationNumber'],
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

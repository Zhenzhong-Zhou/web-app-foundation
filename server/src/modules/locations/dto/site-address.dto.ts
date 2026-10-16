import { OrganizationAddressDto } from '../../../core/organizations/dto/organization-address.dto';

/**
 * A site's address (ADR-071), sent whole, as the registered address is:
 * the same fields and the same rules, a field left out cleared.
 */
export class SiteAddressDto extends OrganizationAddressDto {}

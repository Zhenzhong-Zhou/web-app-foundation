import { SetMetadata } from '@nestjs/common';

export const ALLOW_NO_ORGANIZATION = 'auth:allowNoOrganization';

/**
 * Lets an authenticated route run without a current organization.
 *
 * Almost everything is org-scoped, so the guard rejects a null organization by
 * default rather than letting the request reach TenantDb and die there with a
 * 500. The exceptions are routes about the *account* rather than the tenant:
 * logout, profile, and eventually "you belong to no organizations".
 */
export const AllowNoOrganization = () =>
  SetMetadata(ALLOW_NO_ORGANIZATION, true);

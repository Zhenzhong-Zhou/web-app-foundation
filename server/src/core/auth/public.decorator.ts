import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'auth:isPublic';

/**
 * Opts a route out of authentication.
 *
 * The guard is global, so the default is closed: a new controller is protected
 * before anyone remembers to protect it. Forgetting @Public() on a login route
 * produces an obvious 401 in development; forgetting @UseGuards() on a private
 * route produces an open endpoint nobody notices.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);

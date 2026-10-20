import {
  type CanActivate,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { ERROR_CODES, withCode } from '../../common/error-codes';
import { registrationMode } from '../../common/registration';
import { t } from '../../i18n/translate';

/**
 * The refusal when organizations come by invitation (ADR-078), with its
 * code, for the screen to explain how to get one.
 */
function registrationClosed(): ForbiddenException {
  return new ForbiddenException(
    withCode(
      t({
        id: 'auth.registrationClosed',
        defaultMessage:
          'New organizations join by invitation here. Open the link you were sent, or ask someone in your organization to invite you.',
      }),
      ERROR_CODES.registrationClosed,
    ),
  );
}

/**
 * Lets a request through only while registration is open (ADR-078). A
 * guard, because Nest runs guards before the validation pipe: a closed
 * sign-up form is refused before the body is read or the address looked
 * up, so it cannot tell anyone whether an address has an account (Open
 * decisions, "Registration reveals whether an address is registered").
 */
@Injectable()
export class RegistrationOpenGuard implements CanActivate {
  canActivate(): boolean {
    if (registrationMode() === 'open') return true;
    throw registrationClosed();
  }
}

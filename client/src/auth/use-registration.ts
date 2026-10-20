import { useState } from 'react';

import type { RegistrationSetting } from '../api/types.gen';
import type { Registration } from '../lib/api-names';
import { useResource } from '../lib/use-resource';

/**
 * Whether the sign-up form is open on this deployment (ADR-078), from the
 * server, the only side with the setting: the static client has none of
 * its own. Null while it is read. A read that fails counts as open: the
 * server still refuses the form when it is not, and the page then says
 * so by its code, calling the second item: from then on it reads as by
 * invitation, and the third is true, for the page to announce the change.
 */
export function useRegistration(): [Registration | null, () => void, boolean] {
  const { data, error } =
    useResource<RegistrationSetting>('/auth/registration');
  const [closed, setClosed] = useState(false);
  const registration = closed
    ? 'invitation'
    : (data?.registration ?? (error ? 'open' : null));
  return [registration, () => setClosed(true), closed];
}

import { useContext } from 'react';

import { type ShowToast, ToastContext } from './toast-context';

/** Show a success confirmation. A no-op outside the provider. */
export function useToast(): ShowToast {
  return useContext(ToastContext);
}

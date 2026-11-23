import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';

import type { ToastAction } from '../components/toast-context';
import { useToast } from '../components/use-toast';
import { OFFER_BACK } from '../lib/offer-back';

/** The lot a write put stock into, as its answer names it (ADR-094). */
export interface ReceivedLot {
  id: string | null;
  code: string | null;
  /** Made for us when saved: its code is to be written on the goods. */
  made: boolean;
}

/**
 * The message after Receive stock, an order's Receive and Count it in…
 * (ADR-094, E3): the dialog's words, then for a code made for us Copy
 * code, and for any lot Open the lot, before the dialog's own buttons.
 * Copy code says whether the code went onto the clipboard, the lot still
 * to open; a browser that refuses names the code again instead.
 */
export function useLotMessage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const toast = useToast();

  return (
    message: string,
    lot: ReceivedLot | null,
    more: ToastAction[] = [],
  ) => {
    const open: ToastAction[] = lot?.id
      ? [
          {
            label: intl.formatMessage({
              id: 'inventory.lot.open',
              defaultMessage: 'Open the lot',
            }),
            onClick: () =>
              void navigate(`/lots/${lot.id}`, { state: OFFER_BACK }),
          },
        ]
      : [];
    const code = lot?.made ? lot.code : null;

    async function copy(text: string) {
      let copied = true;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        copied = false;
      }
      toast(
        copied
          ? intl.formatMessage(
              {
                id: 'inventory.lot.copied',
                defaultMessage: 'Lot code {code} copied.',
              },
              { code: text },
            )
          : intl.formatMessage(
              {
                id: 'inventory.lot.copyFailed',
                defaultMessage: 'Could not copy. The lot code is {code}.',
              },
              { code: text },
            ),
        [...open, ...more],
      );
    }

    toast(message, [
      ...(code
        ? [
            {
              label: intl.formatMessage({
                id: 'inventory.lot.copyCode',
                defaultMessage: 'Copy code',
              }),
              onClick: () => void copy(code),
            },
          ]
        : []),
      ...open,
      ...more,
    ]);
  };
}

import Check from '@mui/icons-material/Check';
import ChevronRight from '@mui/icons-material/ChevronRight';
import { Box, Button, ButtonBase, Typography } from '@mui/material';
import { type ReactNode, useEffect, useRef } from 'react';
import {
  defineMessages,
  type IntlShape,
  type MessageDescriptor,
  useIntl,
} from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type { WelcomeDone, WelcomeItem } from '../api/types.gen';
import { useAuth } from '../auth/use-auth';
import { useResendConfirmation } from '../auth/use-resend-confirmation';
import { OFFER_BACK } from '../lib/offer-back';
import { RECENT_PATHS } from '../lib/recent';

type Key = WelcomeItem['key'];

const TITLES = defineMessages<Key>({
  confirmEmail: {
    id: 'home.welcome.confirmEmail',
    defaultMessage: 'Confirm your email address',
  },
  sayWhoYouAre: {
    id: 'home.welcome.sayWhoYouAre',
    defaultMessage: 'Say who you are',
  },
  lookUp: {
    id: 'home.welcome.lookUp',
    defaultMessage: 'Look up a product or a lot',
  },
  openOrder: { id: 'home.welcome.openOrder', defaultMessage: 'Open an order' },
  receiveStock: { id: 'inventory.receive', defaultMessage: 'Receive stock' },
  raiseOrder: { id: 'orders.raise', defaultMessage: 'Raise an order' },
  shipOrder: { id: 'home.welcome.shipOrder', defaultMessage: 'Ship an order' },
  planRun: {
    id: 'home.welcome.planRun',
    defaultMessage: 'Plan a production run',
  },
  draftInvoice: {
    id: 'home.welcome.draftInvoice',
    defaultMessage: 'Draft an invoice',
  },
});

const HINTS = defineMessages({
  sayWhoYouAre: {
    id: 'home.welcome.sayWhoYouAre.hint',
    defaultMessage:
      'A photo or your job title, so colleagues know who you are.',
  },
  lookUp: {
    id: 'home.welcome.lookUp.hint',
    defaultMessage:
      '{products, select, true {Type a name or a lot code in Search at the top, or open Products.} other {Type a lot code in Search at the top, or open Trace a lot.}}',
  },
  openOrder: {
    id: 'home.welcome.openOrder.hint',
    defaultMessage: 'See what was ordered, and where it stands.',
  },
  receiveStock: {
    id: 'home.welcome.receiveStock.hint',
    defaultMessage:
      'Record goods as they arrive, against their order or on their own.',
  },
  // For whoever receives against orders only, without moving stock.
  receiveOrders: {
    id: 'home.welcome.receiveStock.hintOrders',
    defaultMessage:
      'Record goods as they arrive, against the purchase order they came on.',
  },
  raiseOrder: {
    id: 'home.welcome.raiseOrder.hint',
    defaultMessage: 'A purchase from a supplier, or a sale to a customer.',
  },
  shipOrder: {
    id: 'home.welcome.shipOrder.hint',
    defaultMessage: 'Pack a confirmed sale and record what leaves.',
  },
  planRun: {
    id: 'home.welcome.planRun.hint',
    defaultMessage: 'What to make, and how much, from its recipe.',
  },
  draftInvoice: {
    id: 'home.welcome.draftInvoice.hint',
    defaultMessage: 'From a shipment, on the sale’s page in Orders.',
  },
});

/**
 * What a done item says was done (ADR-079), its record's words a link to
 * it: "You opened lot NN-2410-07".
 */
const DID: Partial<Record<Key, MessageDescriptor>> = defineMessages({
  lookUp: {
    id: 'home.welcome.did.lookUp',
    defaultMessage:
      '{kind, select, lot {You opened lot <link>{words}</link>} other {You opened <link>{words}</link>}}',
  },
  openOrder: {
    id: 'home.welcome.did.openOrder',
    defaultMessage: 'You opened order <link>{words}</link>',
  },
  receiveStock: {
    id: 'home.welcome.did.receiveStock',
    defaultMessage:
      '{kind, select, order {You received against order <link>{words}</link>} lot {You received lot <link>{words}</link>} other {You received <link>{words}</link>}}',
  },
  raiseOrder: {
    id: 'home.welcome.did.raiseOrder',
    defaultMessage: 'You raised order <link>{words}</link>',
  },
  shipOrder: {
    id: 'home.welcome.did.shipOrder',
    defaultMessage: 'You shipped order <link>{words}</link>',
  },
  planRun: {
    id: 'home.welcome.did.planRun',
    defaultMessage: 'You planned run <link>{words}</link>',
  },
  draftInvoice: {
    id: 'home.welcome.did.draftInvoice',
    defaultMessage: 'You drafted an invoice: <link>{words}</link>',
  },
});

/**
 * Where each open item's row goes. Receiving goes to Inventory for
 * whoever may move stock, and otherwise to the confirmed purchases, the
 * orders received against (ADR-080).
 */
function whereOf(
  key: Exclude<Key, 'confirmEmail'>,
  canSeeProducts: boolean,
  canMoveStock: boolean,
): string {
  switch (key) {
    case 'sayWhoYouAre':
      return '/account';
    case 'lookUp':
      return canSeeProducts ? '/products' : '/lots';
    case 'openOrder':
      return '/orders';
    case 'receiveStock':
      return canMoveStock
        ? '/inventory'
        : '/orders?direction=purchase&status=confirmed';
    case 'raiseOrder':
      return '/orders/new';
    case 'shipOrder':
      return '/orders?direction=sale&status=confirmed';
    case 'planRun':
      return '/production';
    case 'draftInvoice':
      return '/orders?direction=sale';
  }
}

/**
 * The first week (ADR-079; ADR-091): up to five items, chosen and ticked on
 * the server by what the person has done here since joining, never by
 * hand. Each is one link, its whole row: an open item to where it is done,
 * a done one, ticked and grey, to what was done. Confirming the address is
 * a row with Resend in it instead, and a done item with nothing to open is
 * plain. `canInvite`, for the line that says inviting waits for a
 * confirmed address (`email_unverified`); `canMoveStock`, for where Receive
 * stock goes. The card's head says how many are done.
 */
export function FirstWeek({
  items,
  canSeeProducts,
  canInvite,
  canMoveStock,
}: {
  items: WelcomeItem[];
  canSeeProducts: boolean;
  canInvite: boolean;
  canMoveStock: boolean;
}) {
  const intl = useIntl();
  return (
    <Box
      component="ul"
      aria-label={intl.formatMessage({
        id: 'home.welcome.week',
        defaultMessage: 'Your first week',
      })}
      sx={{ listStyle: 'none', m: 0, p: 0 }}
    >
      {items.map((item) => (
        <Box
          component="li"
          key={item.key}
          sx={{ borderTop: 1, borderColor: 'divider' }}
        >
          <Item
            item={item}
            canSeeProducts={canSeeProducts}
            canInvite={canInvite}
            canMoveStock={canMoveStock}
          />
        </Box>
      ))}
    </Box>
  );
}

const ROW = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: 1.5,
  width: '100%',
  minHeight: 52,
  px: 2,
  py: 0.75,
  textAlign: 'start',
} as const;

function Item({
  item,
  canSeeProducts,
  canInvite,
  canMoveStock,
}: {
  item: WelcomeItem;
  canSeeProducts: boolean;
  canInvite: boolean;
  canMoveStock: boolean;
}) {
  const intl = useIntl();
  const { session } = useAuth();

  let detail: ReactNode = null;
  let to: string | null = null;
  if (item.done) {
    if (item.what) {
      const did = didOf(intl, item.key, item.what);
      detail = did.words;
      to = did.to;
    }
  } else if (item.key !== 'confirmEmail') {
    const hint: MessageDescriptor =
      item.key === 'receiveStock' && !canMoveStock
        ? HINTS.receiveOrders
        : HINTS[item.key];
    detail = intl.formatMessage(hint, { products: String(canSeeProducts) });
    to = whereOf(item.key, canSeeProducts, canMoveStock);
  }

  const words = (
    <Box
      component="span"
      sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}
    >
      <Typography
        component="span"
        sx={{ color: item.done ? 'text.secondary' : 'text.primary' }}
      >
        {intl.formatMessage(TITLES[item.key])}
        {/* The space outside the message, which extraction trims. */}
        {item.done && (
          <>
            {' '}
            <Box component="span" sx={{ position: 'absolute', left: -9999 }}>
              {intl.formatMessage({
                id: 'home.start.done',
                defaultMessage: '(done)',
              })}
            </Box>
          </>
        )}
      </Typography>
      {detail && (
        <Typography
          component="span"
          variant="body2"
          sx={{ color: 'text.secondary' }}
        >
          {detail}
        </Typography>
      )}
    </Box>
  );
  const inside = (
    <>
      <Mark done={item.done} />
      {words}
    </>
  );

  if (!item.done && item.key === 'confirmEmail') {
    return (
      <Box sx={{ ...ROW, flexWrap: 'wrap' }}>
        <Mark done={false} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography>{intl.formatMessage(TITLES.confirmEmail)}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {intl.formatMessage(
              {
                id: 'home.welcome.confirmEmail.hint',
                defaultMessage:
                  'We sent a link to {email}.{invite, select, true { Inviting colleagues waits until you confirm.} other {}}',
              },
              { email: session?.user.email ?? '', invite: String(canInvite) },
            )}
          </Typography>
        </Box>
        <Resend />
      </Box>
    );
  }
  if (!to) return <Box sx={ROW}>{inside}</Box>;
  return (
    <ButtonBase
      component={RouterLink}
      to={to}
      state={OFFER_BACK}
      sx={{ ...ROW, '&:hover': { bgcolor: 'action.hover' } }}
    >
      {inside}
      <ChevronRight
        aria-hidden
        fontSize="small"
        sx={{ color: 'text.secondary' }}
      />
    </ButtonBase>
  );
}

/** A tick once done, else an empty ring. */
function Mark({ done }: { done: boolean }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: 28,
        height: 28,
        flex: 'none',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...(done
          ? { bgcolor: 'tone.positive.bg', color: 'tone.positive.fg' }
          : { border: 2, borderColor: 'divider' }),
      }}
    >
      {done && <Check fontSize="small" />}
    </Box>
  );
}

/**
 * Resend the link: 202 whether or not a message went out, as the banner
 * says it; what happened is announced, as the banner's alert is.
 */
function Resend() {
  const intl = useIntl();
  const { sent, sending, error, resend } = useResendConfirmation();
  // Sent takes the place of the button that had focus, so focus goes to it.
  const sentRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (sent) sentRef.current?.focus();
  }, [sent]);

  return (
    <Box role="status">
      {sent ? (
        <Typography
          ref={sentRef}
          tabIndex={-1}
          variant="body2"
          sx={{ color: 'text.secondary' }}
        >
          {intl.formatMessage({
            id: 'layout.unverified.sent',
            defaultMessage: 'Sent',
          })}
        </Typography>
      ) : (
        <Button variant="outlined" disabled={sending} onClick={resend}>
          {intl.formatMessage({
            id: 'home.welcome.resend',
            defaultMessage: 'Resend the link',
          })}
        </Button>
      )}
      {error && (
        <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}

/**
 * What a done item says was done, and where its row goes: confirmed, a
 * photo or a title, on Your account; or a record, named, opening it. A
 * record since deleted is done all the same, with nothing to open.
 */
function didOf(
  intl: IntlShape,
  key: Key,
  what: WelcomeDone,
): { words: string; to: string | null } {
  switch (what.kind) {
    case 'email':
      return {
        words: intl.formatMessage({
          id: 'home.welcome.did.email',
          defaultMessage: 'Confirmed',
        }),
        to: null,
      };
    case 'photo':
      return {
        words: intl.formatMessage({
          id: 'home.welcome.did.photo',
          defaultMessage: 'Photo added',
        }),
        to: '/account',
      };
    case 'jobTitle':
      return {
        words: intl.formatMessage({
          id: 'home.welcome.did.jobTitle',
          defaultMessage: 'Job title added',
        }),
        to: '/account',
      };
  }

  const message = DID[key];
  if (!what.id || !what.words || !message) {
    return {
      words: intl.formatMessage({
        id: 'home.welcome.did.gone',
        defaultMessage: 'Done',
      }),
      to: null,
    };
  }
  return {
    // The record's words plain, inside the row's one link.
    words: intl.formatMessage(message, {
      kind: what.kind,
      words: what.words,
      link: (chunks: ReactNode[]) => chunks.join(''),
    }),
    to: RECENT_PATHS[what.kind](what.id),
  };
}

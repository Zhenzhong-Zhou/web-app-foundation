import CheckCircle from '@mui/icons-material/CheckCircle';
import RadioButtonUnchecked from '@mui/icons-material/RadioButtonUnchecked';
import {
  Box,
  Button,
  LinearProgress,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import { type ReactNode, useState } from 'react';
import { defineMessages, type MessageDescriptor, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type { WelcomeDone, WelcomeItem } from '../api/types.gen';
import { useAuth } from '../auth/use-auth';
import { NAV_LABELS } from '../layout/navigation';
import { api } from '../lib/api';
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

const PLAN = defineMessages({
  action: { id: 'production.plan', defaultMessage: 'Plan a run' },
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
const DID = defineMessages({
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

/** Where each open item's button goes, and what it says. */
function actionOf(
  key: Exclude<Key, 'confirmEmail'>,
  canSeeProducts: boolean,
): { to: string; label: MessageDescriptor } {
  switch (key) {
    case 'sayWhoYouAre':
      return { to: '/account', label: NAV_LABELS.account };
    case 'lookUp':
      return canSeeProducts
        ? { to: '/products', label: NAV_LABELS.products }
        : { to: '/lots', label: NAV_LABELS.trace };
    case 'openOrder':
      return { to: '/orders', label: NAV_LABELS.orders };
    case 'receiveStock':
      return { to: '/inventory', label: TITLES.receiveStock };
    case 'raiseOrder':
      return { to: '/orders/new', label: TITLES.raiseOrder };
    case 'shipOrder':
      return {
        to: '/orders?direction=sale&status=confirmed',
        label: NAV_LABELS.orders,
      };
    case 'planRun':
      return { to: '/production', label: PLAN.action };
    case 'draftInvoice':
      return { to: '/orders?direction=sale', label: NAV_LABELS.orders };
  }
}

/**
 * The first week (ADR-079): up to five items, chosen and ticked on the
 * server by what the person has done here since joining, never by hand.
 * An open item's button goes where it is done; a done one says what was
 * done and opens it. `canInvite`, for the line that says inviting waits
 * for a confirmed address (`email_unverified`).
 */
export function FirstWeek({
  items,
  canSeeProducts,
  canInvite,
}: {
  items: WelcomeItem[];
  canSeeProducts: boolean;
  canInvite: boolean;
}) {
  const intl = useIntl();
  const done = items.filter((item) => item.done).length;

  return (
    <Stack spacing={1}>
      <Stack
        direction="row"
        sx={{
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 1.5,
        }}
      >
        <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
          {intl.formatMessage({
            id: 'home.welcome.week',
            defaultMessage: 'Your first week',
          })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage(
            {
              id: 'home.welcome.progress',
              defaultMessage: '{done} of {total} done',
            },
            { done, total: items.length },
          )}
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={(done / items.length) * 100}
        color="success"
        aria-hidden
        sx={{ height: 8, borderRadius: 4 }}
      />
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {items.map((item) => (
          <Item
            key={item.key}
            item={item}
            canSeeProducts={canSeeProducts}
            canInvite={canInvite}
          />
        ))}
      </Box>
    </Stack>
  );
}

function Item({
  item,
  canSeeProducts,
  canInvite,
}: {
  item: WelcomeItem;
  canSeeProducts: boolean;
  canInvite: boolean;
}) {
  const intl = useIntl();
  const { session } = useAuth();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  let detail: ReactNode;
  let action: ReactNode = null;

  if (item.done) {
    detail = item.what ? <Did keyOf={item.key} what={item.what} /> : null;
  } else if (item.key === 'confirmEmail') {
    detail = intl.formatMessage(
      {
        id: 'home.welcome.confirmEmail.hint',
        defaultMessage:
          'We sent a link to {email}.{invite, select, true { Inviting colleagues waits until you confirm.} other {}}',
      },
      { email: session?.user.email ?? '', invite: String(canInvite) },
    );
    // 202 whether or not a message went out, as the banner says it.
    action = sent ? (
      <Typography variant="body2" color="text.secondary">
        {intl.formatMessage({
          id: 'layout.unverified.sent',
          defaultMessage: 'Sent',
        })}
      </Typography>
    ) : (
      <Button
        variant="outlined"
        disabled={sending}
        onClick={() => {
          setSending(true);
          void api('/auth/verify-email/resend', { method: 'POST' })
            .then(() => setSent(true))
            .finally(() => setSending(false));
        }}
      >
        {intl.formatMessage({
          id: 'home.welcome.resend',
          defaultMessage: 'Resend the link',
        })}
      </Button>
    );
  } else {
    const hint: MessageDescriptor = HINTS[item.key];
    detail = intl.formatMessage(hint, { products: String(canSeeProducts) });
    const { to, label } = actionOf(item.key, canSeeProducts);
    action = (
      <Button component={RouterLink} to={to} variant="outlined">
        {intl.formatMessage(label)}
      </Button>
    );
  }

  return (
    <Stack
      component="li"
      direction={{ xs: 'column', sm: 'row' }}
      sx={{
        alignItems: { sm: 'center' },
        gap: { xs: 1, sm: 1.5 },
        py: 1.5,
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: 'flex-start', flex: 1, minWidth: 0 }}
      >
        {item.done ? (
          <CheckCircle color="success" aria-hidden />
        ) : (
          <RadioButtonUnchecked color="disabled" aria-hidden />
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600 }}>
            {intl.formatMessage(TITLES[item.key])}
            {item.done && (
              <Box component="span" sx={{ position: 'absolute', left: -9999 }}>
                {intl.formatMessage({
                  id: 'home.start.done',
                  defaultMessage: ' (done)',
                })}
              </Box>
            )}
          </Typography>
          {detail && (
            <Typography variant="body2" color="text.secondary">
              {detail}
            </Typography>
          )}
        </Box>
      </Stack>
      {action}
    </Stack>
  );
}

/** What was done: confirmed, a photo or a title, or a record, linked. */
function Did({ keyOf, what }: { keyOf: Key; what: WelcomeDone }) {
  const intl = useIntl();
  const account = (words: ReactNode) => (
    <Link component={RouterLink} to="/account" underline="always">
      {words}
    </Link>
  );

  switch (what.kind) {
    case 'email':
      return intl.formatMessage({
        id: 'home.welcome.did.email',
        defaultMessage: 'Confirmed',
      });
    case 'photo':
      return account(
        intl.formatMessage({
          id: 'home.welcome.did.photo',
          defaultMessage: 'Photo added',
        }),
      );
    case 'jobTitle':
      return account(
        intl.formatMessage({
          id: 'home.welcome.did.jobTitle',
          defaultMessage: 'Job title added',
        }),
      );
  }

  // A record since deleted: done all the same, with nothing to open.
  const message: MessageDescriptor | null =
    keyOf in DID ? DID[keyOf as keyof typeof DID] : null;
  if (!what.id || !what.words || !message) {
    return intl.formatMessage({
      id: 'home.welcome.did.gone',
      defaultMessage: 'Done',
    });
  }

  const to = RECENT_PATHS[what.kind](what.id);
  return intl.formatMessage(message, {
    kind: what.kind,
    words: what.words,
    link: (chunks: ReactNode[]) => (
      <Link component={RouterLink} to={to} underline="always">
        {chunks}
      </Link>
    ),
  });
}

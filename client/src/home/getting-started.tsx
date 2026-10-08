import CheckCircle from '@mui/icons-material/CheckCircle';
import RadioButtonUnchecked from '@mui/icons-material/RadioButtonUnchecked';
import {
  Box,
  Button,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { defineMessages, type MessageDescriptor, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type { GettingStartedStep, HomeResponse } from '../lib/types';

interface StepMeta {
  title: MessageDescriptor;
  hint: MessageDescriptor;
  action: MessageDescriptor;
  to: string;
}

const M = defineMessages({
  organizationTitle: {
    id: 'home.start.organization',
    defaultMessage: 'Your organization',
  },
  organizationHint: {
    id: 'home.start.organization.hint',
    defaultMessage: 'Address, tax number and currency, which invoices need',
  },
  organizationAction: {
    id: 'home.start.organization.action',
    defaultMessage: 'Open settings',
  },
  locationTitle: {
    id: 'home.start.location',
    defaultMessage: 'Add a location',
  },
  locationHint: {
    id: 'home.start.location.hint',
    defaultMessage: 'Where stock is kept: a warehouse, a shelf',
  },
  productTitle: { id: 'home.start.product', defaultMessage: 'Add a product' },
  productHint: {
    id: 'home.start.product.hint',
    defaultMessage: 'What you buy, make or sell',
  },
  partnerTitle: { id: 'home.start.partner', defaultMessage: 'Add a partner' },
  partnerHint: {
    id: 'home.start.partner.hint',
    defaultMessage: 'A customer you sell to, or a supplier you buy from',
  },
  receiptTitle: { id: 'home.start.receipt', defaultMessage: 'Receive stock' },
  receiptHint: {
    id: 'home.start.receipt.hint',
    defaultMessage: 'Your first lots, so there is something to ship',
  },
  invoiceTitle: {
    id: 'home.start.invoice',
    defaultMessage: 'Ship and invoice an order',
  },
  invoiceHint: {
    id: 'home.start.invoice.hint',
    defaultMessage:
      'Raise an order, ship it and issue its invoice: the whole flow once',
  },
  invoiceAction: { id: 'orders.raise', defaultMessage: 'Raise an order' },
  teamTitle: { id: 'home.start.team', defaultMessage: 'Add your team' },
  teamHint: {
    id: 'home.start.team.hint',
    defaultMessage: 'People who work here, each with their role. Optional.',
  },
  teamAction: { id: 'home.start.team.action', defaultMessage: 'Add a member' },
});

/** The seven steps (ADR-058), in the order they depend on each other. */
const STEPS: { key: GettingStartedStep; meta: StepMeta }[] = [
  {
    key: 'organization',
    meta: {
      title: M.organizationTitle,
      hint: M.organizationHint,
      action: M.organizationAction,
      to: '/settings/organization',
    },
  },
  {
    key: 'location',
    meta: {
      title: M.locationTitle,
      hint: M.locationHint,
      action: M.locationTitle,
      to: '/locations',
    },
  },
  {
    key: 'product',
    meta: {
      title: M.productTitle,
      hint: M.productHint,
      action: M.productTitle,
      to: '/products',
    },
  },
  {
    key: 'partner',
    meta: {
      title: M.partnerTitle,
      hint: M.partnerHint,
      action: M.partnerTitle,
      to: '/partners',
    },
  },
  {
    key: 'receipt',
    meta: {
      title: M.receiptTitle,
      hint: M.receiptHint,
      action: M.receiptTitle,
      to: '/inventory',
    },
  },
  {
    key: 'invoice',
    meta: {
      title: M.invoiceTitle,
      hint: M.invoiceHint,
      action: M.invoiceAction,
      to: '/orders/new',
    },
  },
  {
    key: 'team',
    meta: {
      title: M.teamTitle,
      hint: M.teamHint,
      action: M.teamAction,
      to: '/members',
    },
  },
];

/**
 * Getting started (ADR-058): seven steps, each ticked by what the
 * organization holds. The first open step's button is the page's primary
 * action. Only the team step can be skipped; the card can be dismissed.
 * Both controls are the organization's settings, offered only to those who
 * may change them (`canManage`).
 */
export function GettingStarted({
  state,
  canManage,
  onDismiss,
  onSkipTeam,
}: {
  state: HomeResponse['gettingStarted'];
  canManage: boolean;
  onDismiss: () => void;
  onSkipTeam: () => void;
}) {
  const intl = useIntl();
  const doneOf = (key: GettingStartedStep) =>
    state.steps[key] || (key === 'team' && state.teamSkipped);
  const done = STEPS.filter(({ key }) => doneOf(key)).length;
  const next = STEPS.find(({ key }) => !doneOf(key))?.key;

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby="getting-started-title"
      sx={{ p: { xs: 2, sm: 3 } }}
    >
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 2 }}
      >
        <Typography variant="h6" component="h2" id="getting-started-title">
          {intl.formatMessage({
            id: 'home.start.title',
            defaultMessage: 'Getting started',
          })}
        </Typography>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'baseline' }}>
          <Typography color="text.secondary">
            {intl.formatMessage(
              {
                id: 'home.start.progress',
                defaultMessage: '{done} of {total} done',
              },
              { done, total: STEPS.length },
            )}
          </Typography>
          {canManage && (
            <Button variant="text" onClick={onDismiss}>
              {intl.formatMessage({
                id: 'home.start.dismiss',
                defaultMessage: 'Dismiss',
              })}
            </Button>
          )}
        </Stack>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={(done / STEPS.length) * 100}
        color="success"
        aria-hidden
        sx={{ my: 1.5, height: 8, borderRadius: 4 }}
      />
      {STEPS.map(({ key, meta }) => {
        const finished = doneOf(key);
        return (
          <Stack
            key={key}
            direction={{ xs: 'column', sm: 'row' }}
            sx={{
              alignItems: { sm: 'center' },
              gap: { xs: 1, sm: 2 },
              py: 1.5,
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            <Stack
              direction="row"
              spacing={2}
              sx={{ alignItems: 'center', flex: 1 }}
            >
              {finished ? (
                <CheckCircle color="success" aria-hidden />
              ) : (
                <RadioButtonUnchecked color="disabled" aria-hidden />
              )}
              <Box>
                <Typography sx={{ fontWeight: 600 }}>
                  {intl.formatMessage(meta.title)}
                  {finished && (
                    <Box
                      component="span"
                      sx={{ position: 'absolute', left: -9999 }}
                    >
                      {intl.formatMessage({
                        id: 'home.start.done',
                        defaultMessage: ' (done)',
                      })}
                    </Box>
                  )}
                </Typography>
                <Typography color="text.secondary">
                  {intl.formatMessage(meta.hint)}
                </Typography>
              </Box>
            </Stack>
            {!finished && (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                {key === 'team' && canManage && (
                  <Button variant="text" onClick={onSkipTeam}>
                    {intl.formatMessage({
                      id: 'home.start.skip',
                      defaultMessage: 'Skip',
                    })}
                  </Button>
                )}
                <Button
                  component={RouterLink}
                  to={meta.to}
                  variant={key === next ? 'contained' : 'outlined'}
                >
                  {intl.formatMessage(meta.action)}
                </Button>
              </Stack>
            )}
          </Stack>
        );
      })}
    </Paper>
  );
}

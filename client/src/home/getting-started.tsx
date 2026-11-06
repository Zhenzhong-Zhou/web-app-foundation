import Check from '@mui/icons-material/Check';
import ChevronRight from '@mui/icons-material/ChevronRight';
import {
  Box,
  Button,
  ButtonBase,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { defineMessages, type MessageDescriptor, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type { HomeResponse } from '../api/types.gen';
import type { LearnMoreTarget } from '../help/guides';
import { LearnMore } from '../help/learn-more';
import type { GettingStartedStep } from '../lib/api-names';
import { OFFER_BACK } from '../lib/offer-back';

interface StepMeta {
  title: MessageDescriptor;
  hint: MessageDescriptor;
  action: MessageDescriptor;
  to: string;
  /** The guide's section on doing it, after the hint (ADR-079). */
  learnMore: LearnMoreTarget;
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
  teamTitle: { id: 'home.start.team', defaultMessage: 'Invite your team' },
  teamHint: {
    id: 'home.start.team.hint',
    defaultMessage: 'People who work here, each with their roles. Optional.',
  },
  teamAction: {
    id: 'home.start.team.action',
    defaultMessage: 'Invite someone',
  },
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
      learnMore: { guide: 'organization', section: 'profile' },
    },
  },
  {
    key: 'location',
    meta: {
      title: M.locationTitle,
      hint: M.locationHint,
      action: M.locationTitle,
      to: '/locations',
      learnMore: { guide: 'locations', section: 'add' },
    },
  },
  {
    key: 'product',
    meta: {
      title: M.productTitle,
      hint: M.productHint,
      action: M.productTitle,
      to: '/products',
      learnMore: { guide: 'products', section: 'add' },
    },
  },
  {
    key: 'partner',
    meta: {
      title: M.partnerTitle,
      hint: M.partnerHint,
      action: M.partnerTitle,
      to: '/partners',
      learnMore: { guide: 'partners', section: 'add' },
    },
  },
  {
    key: 'receipt',
    meta: {
      title: M.receiptTitle,
      hint: M.receiptHint,
      action: M.receiptTitle,
      to: '/inventory',
      learnMore: { guide: 'inventory', section: 'receive' },
    },
  },
  {
    key: 'invoice',
    meta: {
      title: M.invoiceTitle,
      hint: M.invoiceHint,
      action: M.invoiceAction,
      to: '/orders/new',
      learnMore: { guide: 'orders', section: 'raise' },
    },
  },
  {
    key: 'team',
    meta: {
      title: M.teamTitle,
      hint: M.teamHint,
      action: M.teamAction,
      // Members with the Invite dialog open (ADR-077).
      to: '/members?invite',
      learnMore: { guide: 'members', section: 'invite' },
    },
  },
];

/**
 * Getting started (ADR-058; ADR-091): seven steps, each ticked by what the
 * organization holds, under a progress bar. The next step to take is the
 * page's one main action, its button filled, with Learn more beside it; a
 * done step is ticked and grey; every other step is one link, its whole
 * row. Only the team step can be skipped, once it is the next; the card
 * can be dismissed. Both controls are the organization's settings, offered
 * only to those who may change them (`canManage`). The team step goes to
 * Invite someone for those who may invite (`canInvite`, users.create);
 * anyone else sees the step without a link.
 */
export function GettingStarted({
  state,
  canManage,
  canInvite,
  onDismiss,
  onSkipTeam,
}: {
  state: HomeResponse['gettingStarted'];
  canManage: boolean;
  canInvite: boolean;
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
      sx={{ overflow: 'hidden' }}
    >
      <Stack spacing={1} sx={{ p: 2 }}>
        <Stack
          direction="row"
          sx={{
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <Typography variant="h6" component="h2" id="getting-started-title">
            {intl.formatMessage({
              id: 'home.start.title',
              defaultMessage: 'Getting started',
            })}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography
              variant="body2"
              sx={{ color: 'text.secondary', fontWeight: 600 }}
            >
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
          aria-hidden
          // A grey track, so the share done is the accent alone.
          sx={{ height: 8, borderRadius: 4, bgcolor: 'action.selected' }}
        />
        <Typography sx={{ color: 'text.secondary' }}>
          {intl.formatMessage({
            id: 'home.summary.start',
            defaultMessage:
              'Seven steps get your organization ready to work. Each is ticked when it is done.',
          })}
        </Typography>
      </Stack>
      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {STEPS.map(({ key, meta }, index) => (
          <Box
            component="li"
            key={key}
            sx={{ borderTop: 1, borderColor: 'divider' }}
          >
            {key === next ? (
              <NextStep
                stepKey={key}
                meta={meta}
                number={index + 1}
                canSkip={key === 'team' && canManage}
                canInvite={canInvite}
                onSkipTeam={onSkipTeam}
              />
            ) : (
              <Step
                meta={meta}
                number={index + 1}
                finished={doneOf(key)}
                linked={key !== 'team' || canInvite}
              />
            )}
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

/** A step's mark: a tick once done, else its number, ringed. */
function Mark({
  number,
  finished,
  next = false,
}: {
  number: number;
  finished: boolean;
  next?: boolean;
}) {
  return (
    <Box
      aria-hidden
      sx={{
        width: 32,
        height: 32,
        flex: 'none',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        typography: 'body2',
        fontWeight: 700,
        ...(finished
          ? { bgcolor: 'tone.positive.bg', color: 'tone.positive.fg' }
          : {
              border: 2,
              borderColor: next ? 'primary.main' : 'divider',
              color: 'text.secondary',
            }),
      }}
    >
      {finished ? <Check fontSize="small" /> : number}
    </Box>
  );
}

/** A step's title over its hint, grey once done. */
function Words({ meta, finished }: { meta: StepMeta; finished: boolean }) {
  const intl = useIntl();
  const title = intl.formatMessage(meta.title);
  return (
    <Box
      component="span"
      sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}
    >
      <Typography
        component="span"
        sx={{
          fontWeight: 600,
          color: finished ? 'text.secondary' : 'text.primary',
        }}
      >
        {finished
          ? intl.formatMessage(
              { id: 'home.start.stepDone', defaultMessage: '{step} · Done' },
              { step: title },
            )
          : title}
      </Typography>
      <Typography
        component="span"
        variant="body2"
        sx={{ color: 'text.secondary' }}
      >
        {intl.formatMessage(meta.hint)}
      </Typography>
    </Box>
  );
}

const ROW = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: 1.5,
  width: '100%',
  // Above 44 px, the hint's second line included (ADR-091).
  minHeight: 64,
  px: 2,
  py: 1,
  textAlign: 'start',
} as const;

/**
 * A step other than the next: one link, its whole row, where it is done;
 * plain where the reader cannot go there (the team step, without
 * users.create).
 */
function Step({
  meta,
  number,
  finished,
  linked,
}: {
  meta: StepMeta;
  number: number;
  finished: boolean;
  linked: boolean;
}) {
  const inside = (
    <>
      <Mark number={number} finished={finished} />
      <Words meta={meta} finished={finished} />
    </>
  );
  if (!linked) return <Box sx={ROW}>{inside}</Box>;
  return (
    <ButtonBase
      component={RouterLink}
      to={meta.to}
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

/**
 * The next step: marked in the accent, its button the page's one main
 * action, Learn more beside it, and Skip for the team step.
 */
function NextStep({
  stepKey,
  meta,
  number,
  canSkip,
  canInvite,
  onSkipTeam,
}: {
  stepKey: GettingStartedStep;
  meta: StepMeta;
  number: number;
  canSkip: boolean;
  canInvite: boolean;
  onSkipTeam: () => void;
}) {
  const intl = useIntl();
  return (
    <Stack spacing={1.25} sx={{ px: 2, py: 1.75, bgcolor: 'surface.chosen' }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Mark number={number} finished={false} next />
        <Words meta={meta} finished={false} />
      </Stack>
      <Stack
        direction="row"
        sx={{
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1.5,
          // Under the words, past the mark and its gap.
          pl: 5.5,
        }}
      >
        {(stepKey !== 'team' || canInvite) && (
          <Button
            component={RouterLink}
            to={meta.to}
            state={OFFER_BACK}
            variant="contained"
          >
            {intl.formatMessage(meta.action)}
          </Button>
        )}
        <LearnMore target={meta.learnMore} variant="beside" />
        {canSkip && (
          <Button variant="text" onClick={onSkipTeam}>
            {intl.formatMessage({
              id: 'home.start.skip',
              defaultMessage: 'Skip',
            })}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

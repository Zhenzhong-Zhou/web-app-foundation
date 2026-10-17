import {
  Alert,
  Box,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Skeleton,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { type ReactNode, type SubmitEvent, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import type { OrganizationProfile } from '../api/types.gen';
import { HistoryButton } from '../audit/history-button';
import { useCan } from '../auth/permissions';
import { useAuth } from '../auth/use-auth';
import { AddressFields } from '../components/address-fields';
import { addressBody, addressValues } from '../components/address-values';
import { CurrencyField } from '../components/currency-field';
import { PageHeader } from '../components/page-header';
import { SettingsSection } from '../components/settings-section';
import { api } from '../lib/api';
import type { LicencePolicy, PaperSize } from '../lib/api-names';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { useSubmit } from '../lib/use-submit';
import { useTab } from '../lib/use-tab';
import { DefaultSaleListForm } from '../price-lists/default-sale-list-form';
import { BrandingForm } from './branding-form';
import { ClosingSections } from './closing-sections';
import {
  OrganizationDocumentLanguages,
  RequiredNameLanguages,
} from './document-languages-form';
import { IdleSignOutForm } from './idle-sign-out-form';
import { TimeZoneForm } from './time-zone-form';

/**
 * The Organization page's tabs (ADR-061), Profile first. Branding is only
 * for those who may change it (ADR-060): nothing there is worth reading
 * without changing it, and every member sees its result anyway.
 */
const READ_TABS = ['profile', 'money', 'documents', 'stock'] as const;
const ORGANIZATION_TABS = [...READ_TABS, 'branding', 'security'] as const;
type OrganizationTab = (typeof ORGANIZATION_TABS)[number];

const TAB_LABEL = defineMessages({
  profile: { id: 'settings.org.tab.profile', defaultMessage: 'Profile' },
  money: { id: 'settings.org.tab.money', defaultMessage: 'Money' },
  documents: { id: 'settings.org.tab.documents', defaultMessage: 'Documents' },
  stock: { id: 'settings.org.tab.stock', defaultMessage: 'Stock' },
  branding: { id: 'settings.org.tab.branding', defaultMessage: 'Branding' },
  security: { id: 'settings.org.tab.security', defaultMessage: 'Security' },
});

/**
 * The organization's settings (ADR-061), in tabs: Profile (the name and
 * what every invoice prints as the seller, ADR-046), Money (the base
 * currency, ADR-048, and the default sale price list), Documents (their
 * languages, ADR-054) and Stock (licences at release, ADR-050). Branding
 * joins them with ADR-060.
 *
 * Each tab has its address, `?tab=money`, so a link can open the one it
 * means. Every tab stays mounted and only the open one shows, so moving
 * between tabs keeps whatever was typed and not yet saved.
 *
 * Small forms rather than one, because they are changed for different
 * reasons — a new registration, an office move, the first costed receipt.
 * Anyone can read them; only the Owner changes them.
 */
export function OrganizationPage() {
  const intl = useIntl();
  const can = useCan();
  const { refresh } = useAuth();
  const { data, error, reload } = useResource<{
    organization: OrganizationProfile;
  }>('/organization');
  const organization = data?.organization ?? null;
  const showSkeleton = useDelayedFlag(organization === null && !error);
  const canUpdate = can('organizations.update');
  const tabs: readonly OrganizationTab[] = canUpdate
    ? ORGANIZATION_TABS
    : READ_TABS;
  const [tab, setTab] = useTab<OrganizationTab>(tabs);

  /** A save the whole app shows: the theme, chips and logo read it. */
  const reloadAll = async () => {
    await Promise.all([reload(), refresh()]);
  };

  /** One tab's forms, shown only while it is open. */
  const panel = (id: OrganizationTab, children: ReactNode) => (
    <Stack
      role="tabpanel"
      id={`organization-panel-${id}`}
      aria-labelledby={`organization-tab-${id}`}
      hidden={tab !== id}
      spacing={3}
      // `hidden` alone loses to Stack's display: flex.
      sx={{ display: tab === id ? 'flex' : 'none' }}
    >
      {children}
    </Stack>
  );

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={
          organization?.name ??
          intl.formatMessage({
            id: 'layout.menu.organization',
            defaultMessage: 'Organization',
          })
        }
        actions={
          <Stack direction="row" spacing={1}>
            {organization && <HistoryButton resourceId={organization.id} />}
          </Stack>
        }
      />

      {error && <Alert severity="error">{error}</Alert>}

      {organization ? (
        <>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs
              value={tab}
              onChange={(_, next: OrganizationTab) => setTab(next)}
              aria-label={intl.formatMessage({
                id: 'settings.org.tabs',
                defaultMessage: 'Organization settings',
              })}
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
            >
              {tabs.map((id) => (
                <Tab
                  key={id}
                  value={id}
                  id={`organization-tab-${id}`}
                  aria-controls={`organization-panel-${id}`}
                  label={intl.formatMessage(TAB_LABEL[id])}
                />
              ))}
            </Tabs>
          </Box>

          {/* Keyed on what was saved, so a reload resets each form. */}
          {panel(
            'profile',
            <>
              <Typography color="text.secondary">
                {intl.formatMessage({
                  id: 'settings.org.intro',
                  defaultMessage:
                    'Every invoice prints these as the seller, copied on the day it is issued — changing them here never changes an invoice already sent. Invoices cannot be issued until the registered address is set.',
                })}
              </Typography>
              <NameForm
                key={organization.name}
                value={organization.name}
                readOnly={!canUpdate}
                // The name is in the side rail and the top bar too.
                onSaved={reloadAll}
              />
              <TaxNumberForm
                key={`tax-${organization.taxRegistrationNumber ?? ''}`}
                value={organization.taxRegistrationNumber}
                readOnly={!canUpdate}
                onSaved={reload}
              />
              <AddressForm
                key={JSON.stringify(organization.address)}
                address={organization.address}
                readOnly={!canUpdate}
                onSaved={reload}
              />
              <TimeZoneForm
                key={`zone-${organization.timeZone}`}
                value={organization.timeZone}
                readOnly={!canUpdate}
                // The session carries the zone, which decides the day on
                // every screen (ADR-072).
                onSaved={reloadAll}
              />
              {/* Last, and Owners' only: the organization's records and its
                  end (ADR-070). */}
              <ClosingSections organization={organization} onChanged={reload} />
            </>,
          )}
          {panel(
            'money',
            <>
              <BaseCurrencyForm
                // Named apart, so two settings not yet set are not both ''
                // (#127).
                key={`currency-${organization.baseCurrency ?? ''}`}
                value={organization.baseCurrency}
                readOnly={!canUpdate}
                onSaved={reload}
              />
              {can('price_lists.view') && (
                <DefaultSaleListForm
                  key={`price-list-${organization.defaultSalePriceListId ?? ''}`}
                  value={organization.defaultSalePriceListId}
                  readOnly={!canUpdate}
                  onSaved={reload}
                />
              )}
            </>,
          )}
          {panel(
            'documents',
            <>
              <OrganizationDocumentLanguages
                key={[
                  organization.documentLanguage,
                  organization.documentSecondLanguage,
                ].join()}
                documentLanguage={organization.documentLanguage}
                documentSecondLanguage={organization.documentSecondLanguage}
                readOnly={!canUpdate}
                onSaved={reload}
              />
              <RequiredNameLanguages
                key={`names-${organization.requiredNameLanguages.join()}`}
                value={organization.requiredNameLanguages}
                readOnly={!canUpdate}
                onSaved={reload}
              />
              <LogoOnDocumentsForm
                key={String(organization.logoOnDocuments)}
                value={organization.logoOnDocuments}
                readOnly={!canUpdate}
                onSaved={reloadAll}
              />
              <PaperSizeForm
                key={String(organization.paperSize)}
                value={organization.paperSize}
                readOnly={!canUpdate}
                onSaved={reload}
              />
            </>,
          )}
          {panel(
            'stock',
            <>
              <ExpiryDaysForm
                key={[
                  organization.expiryWarningDays,
                  organization.expiryCriticalDays,
                ].join()}
                warning={organization.expiryWarningDays}
                critical={organization.expiryCriticalDays}
                readOnly={!canUpdate}
                onSaved={reloadAll}
              />
              <LicencePolicyForm
                key={[
                  organization.licenceNotInForcePolicy,
                  organization.licenceExpiredPolicy,
                  organization.licenceRequired,
                ].join()}
                organization={organization}
                readOnly={!canUpdate}
                onSaved={reload}
              />
            </>,
          )}
          {canUpdate &&
            panel(
              'branding',
              <BrandingForm
                key={[
                  organization.logoFileId,
                  organization.accentColor,
                  organization.rail,
                ].join()}
                logoFileId={organization.logoFileId}
                accentColor={organization.accentColor}
                rail={organization.rail}
                onSaved={reloadAll}
              />,
            )}
          {canUpdate &&
            panel(
              'security',
              <IdleSignOutForm
                key={[
                  organization.idleSignOutMinutes,
                  organization.idleSignOutScope,
                ].join()}
                minutes={organization.idleSignOutMinutes}
                scope={organization.idleSignOutScope}
                onSaved={reloadAll}
              />,
            )}
        </>
      ) : showSkeleton ? (
        <Skeleton variant="rounded" height={240} />
      ) : null}
    </Stack>
  );
}

/**
 * The organization's name (ADR-061). Issued invoices and credit notes keep
 * the name they were issued with; from the save on, the app and new
 * documents carry this one.
 */
function NameForm({
  value,
  readOnly,
  onSaved,
}: {
  value: string;
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const [name, setName] = useState(value);
  const { submitting, error, submit } = useSubmit(onSaved, {
    success: intl.formatMessage({
      id: 'settings.org.name.saved',
      defaultMessage: 'Name saved',
    }),
  });

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    void submit(() =>
      api('/organization', {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim() }),
      }),
    );
  }

  return (
    <SettingsSection
      title={intl.formatMessage({
        id: 'settings.org.name.title',
        defaultMessage: 'Name',
      })}
      onSubmit={handleSubmit}
      error={error}
      submitting={submitting}
      readOnly={readOnly}
      saveLabel={intl.formatMessage({
        id: 'settings.org.name.save',
        defaultMessage: 'Save name',
      })}
    >
      <TextField
        id="organization-name"
        label={intl.formatMessage({
          id: 'settings.org.name.label',
          defaultMessage: 'Organization name',
        })}
        fullWidth
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
        disabled={readOnly}
        helperText={intl.formatMessage({
          id: 'settings.org.name.help',
          defaultMessage:
            'Shown across the app and on new invoices, credit notes and packing slips. Those already issued keep the name they were issued with.',
        })}
        slotProps={{ htmlInput: { maxLength: 100 } }}
      />
    </SettingsSection>
  );
}

/**
 * When a lot counts as expiring (ADR-060), on every list and on Home: the
 * organization's own, since a bakery and a supplement maker cannot share
 * 90 and 30.
 */
function ExpiryDaysForm({
  warning,
  critical,
  readOnly,
  onSaved,
}: {
  warning: number;
  critical: number;
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const [warningDays, setWarningDays] = useState(String(warning));
  const [criticalDays, setCriticalDays] = useState(String(critical));
  const { submitting, error, submit } = useSubmit(onSaved, {
    success: intl.formatMessage({
      id: 'settings.org.expiry.saved',
      defaultMessage: 'Expiry saved',
    }),
  });

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    void submit(() =>
      api('/organization', {
        method: 'PATCH',
        body: JSON.stringify({
          expiryWarningDays: Number(warningDays),
          expiryCriticalDays: Number(criticalDays),
        }),
      }),
    );
  }

  const days = { min: 1, max: 365, step: 1 };

  return (
    <SettingsSection
      title={intl.formatMessage({
        id: 'settings.org.expiry.title',
        defaultMessage: 'Expiry',
      })}
      onSubmit={handleSubmit}
      error={error}
      submitting={submitting}
      readOnly={readOnly}
      saveLabel={intl.formatMessage({
        id: 'settings.org.expiry.save',
        defaultMessage: 'Save expiry',
      })}
    >
      <Typography color="text.secondary">
        {intl.formatMessage({
          id: 'settings.org.expiry.intro',
          defaultMessage:
            'When a lot counts as expiring, on every list and on Home. Urgent must be fewer days than expiring soon; both from 1 to 365.',
        })}
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          id="organization-expiry-warning"
          type="number"
          label={intl.formatMessage({
            id: 'settings.org.expiry.warning',
            defaultMessage: 'Expiring soon, within days',
          })}
          value={warningDays}
          onChange={(event) => setWarningDays(event.target.value)}
          disabled={readOnly}
          slotProps={{ htmlInput: days }}
        />
        <TextField
          id="organization-expiry-critical"
          type="number"
          label={intl.formatMessage({
            id: 'settings.org.expiry.critical',
            defaultMessage: 'Urgent, within days',
          })}
          value={criticalDays}
          onChange={(event) => setCriticalDays(event.target.value)}
          disabled={readOnly}
          slotProps={{ htmlInput: days }}
        />
      </Stack>
    </SettingsSection>
  );
}

/** Whether invoices, credit notes and packing slips print the logo. */
function LogoOnDocumentsForm({
  value,
  readOnly,
  onSaved,
}: {
  value: boolean;
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const [printLogo, setPrintLogo] = useState(value);
  const { submitting, error, submit } = useSubmit(onSaved, {
    success: intl.formatMessage({
      id: 'settings.org.printLogo.saved',
      defaultMessage: 'Logo on documents saved',
    }),
  });

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    void submit(() =>
      api('/organization', {
        method: 'PATCH',
        body: JSON.stringify({ logoOnDocuments: printLogo }),
      }),
    );
  }

  return (
    <SettingsSection
      title={intl.formatMessage({
        id: 'settings.org.printLogo.title',
        defaultMessage: 'Logo on documents',
      })}
      onSubmit={handleSubmit}
      error={error}
      submitting={submitting}
      readOnly={readOnly}
      saveLabel={intl.formatMessage({
        id: 'settings.org.printLogo.save',
        defaultMessage: 'Save logo on documents',
      })}
    >
      <FormControlLabel
        control={
          <Switch
            checked={printLogo}
            onChange={(event) => setPrintLogo(event.target.checked)}
            disabled={readOnly}
          />
        }
        label={intl.formatMessage({
          id: 'settings.org.printLogo.label',
          defaultMessage:
            'Print the logo on invoices, credit notes and packing slips',
        })}
      />
      <Typography variant="body2" color="text.secondary">
        {intl.formatMessage({
          id: 'settings.org.printLogo.help',
          defaultMessage:
            'At the top left, at most 18 mm tall, once the organization has a logo. Turn off if your printed stationery already carries it.',
        })}
      </Typography>
    </SettingsSection>
  );
}

const PAPER_LABEL = defineMessages({
  automatic: {
    id: 'settings.org.paper.automatic',
    defaultMessage:
      'Automatic: Letter in Canada and the United States, A4 elsewhere',
  },
  letter: {
    id: 'settings.org.paper.letter',
    defaultMessage: 'Letter (8.5 × 11 in)',
  },
  a4: { id: 'settings.org.paper.a4', defaultMessage: 'A4 (210 × 297 mm)' },
});

type PaperChoice = PaperSize | 'automatic';

const PAPERS: PaperChoice[] = ['automatic', 'letter', 'a4'];

/**
 * The paper every document is drawn on (ADR-071): automatic, from the
 * registered address's country, or Letter or A4 for every document.
 */
function PaperSizeForm({
  value,
  readOnly,
  onSaved,
}: {
  value: OrganizationProfile['paperSize'];
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const [paper, setPaper] = useState<PaperChoice>(value ?? 'automatic');
  const { submitting, error, submit } = useSubmit(onSaved, {
    success: intl.formatMessage({
      id: 'settings.org.paper.saved',
      defaultMessage: 'Paper size saved',
    }),
  });
  const title = intl.formatMessage({
    id: 'settings.org.paper.title',
    defaultMessage: 'Paper size',
  });

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    void submit(() =>
      api('/organization', {
        method: 'PATCH',
        body: JSON.stringify({
          paperSize: paper === 'automatic' ? null : paper,
        }),
      }),
    );
  }

  return (
    <SettingsSection
      title={title}
      onSubmit={handleSubmit}
      error={error}
      submitting={submitting}
      readOnly={readOnly}
      saveLabel={intl.formatMessage({
        id: 'settings.org.paper.save',
        defaultMessage: 'Save paper size',
      })}
    >
      <RadioGroup
        aria-label={title}
        value={paper}
        onChange={(event) => setPaper(event.target.value as PaperChoice)}
      >
        {PAPERS.map((each) => (
          <FormControlLabel
            key={each}
            value={each}
            control={<Radio />}
            disabled={readOnly}
            label={intl.formatMessage(PAPER_LABEL[each])}
          />
        ))}
      </RadioGroup>
      <Typography variant="body2" color="text.secondary">
        {intl.formatMessage({
          id: 'settings.org.paper.help',
          defaultMessage:
            'Every document is drawn on it: invoices, credit notes, packing slips, purchase orders, pro forma invoices and return authorizations, and the PDFs in the export. Automatic goes by the country of the registered address.',
        })}
      </Typography>
    </SettingsSection>
  );
}

function TaxNumberForm({
  value,
  readOnly,
  onSaved,
}: {
  value: string | null;
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const [taxNumber, setTaxNumber] = useState(value ?? '');
  const { submitting, error, submit } = useSubmit(onSaved, {
    success: intl.formatMessage({
      id: 'settings.org.tax.saved',
      defaultMessage: 'Tax number saved',
    }),
  });

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    // Empty clears it: not every organization is registered.
    void submit(() =>
      api('/organization', {
        method: 'PATCH',
        body: JSON.stringify({ taxRegistrationNumber: taxNumber.trim() }),
      }),
    );
  }

  return (
    <SettingsSection
      title={intl.formatMessage({
        id: 'settings.org.tax.title',
        defaultMessage: 'Tax registration',
      })}
      onSubmit={handleSubmit}
      error={error}
      submitting={submitting}
      readOnly={readOnly}
      saveLabel={intl.formatMessage({
        id: 'settings.org.tax.save',
        defaultMessage: 'Save tax number',
      })}
    >
      <TextField
        id="organization-tax-number"
        label={intl.formatMessage({
          id: 'settings.org.tax.label',
          defaultMessage: 'Tax registration number',
        })}
        fullWidth
        value={taxNumber}
        onChange={(event) => setTaxNumber(event.target.value)}
        disabled={readOnly}
        helperText={intl.formatMessage({
          id: 'settings.org.tax.help',
          defaultMessage:
            'GST/HST, VAT, ABN — as issued. Leave blank if not registered.',
        })}
        slotProps={{ htmlInput: { maxLength: 50 } }}
      />
    </SettingsSection>
  );
}

function AddressForm({
  address,
  readOnly,
  onSaved,
}: {
  address: OrganizationProfile['address'];
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const [form, setForm] = useState(addressValues(address));

  const { submitting, error, submit } = useSubmit(onSaved, {
    success: intl.formatMessage({
      id: 'settings.org.address.saved',
      defaultMessage: 'Registered address saved',
    }),
  });

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    // Sent whole: a field left blank is cleared, as the PUT says.
    void submit(() =>
      api('/organization/address', {
        method: 'PUT',
        body: JSON.stringify(addressBody(form)),
      }),
    );
  }

  return (
    <SettingsSection
      title={intl.formatMessage({
        id: 'settings.org.address.title',
        defaultMessage: 'Registered address',
      })}
      onSubmit={handleSubmit}
      error={error}
      submitting={submitting}
      readOnly={readOnly}
      saveLabel={intl.formatMessage({
        id: 'settings.org.address.save',
        defaultMessage: 'Save address',
      })}
      notice={
        !address &&
        !readOnly && (
          <Alert severity="info">
            {intl.formatMessage({
              id: 'settings.org.address.notSet',
              defaultMessage:
                'Not set yet. Invoices print this, so none can be issued until it is.',
            })}
          </Alert>
        )
      }
    >
      <AddressFields
        idPrefix="organization"
        value={form}
        onChange={setForm}
        disabled={readOnly}
      />
    </SettingsSection>
  );
}

/**
 * What stock is valued in (ADR-048). Set once, before the first costed
 * receipt: until then every receipt waits for a cost, and once anything
 * carries a value the server refuses a change, because every stored value
 * would silently change currency with it.
 */
function BaseCurrencyForm({
  value,
  readOnly,
  onSaved,
}: {
  value: string | null;
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const [currency, setCurrency] = useState(value ?? '');
  const { submitting, error, submit } = useSubmit(onSaved, {
    success: intl.formatMessage({
      id: 'settings.org.currency.saved',
      defaultMessage: 'Base currency saved',
    }),
  });

  const trimmed = currency.trim().toUpperCase();

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(() =>
      api('/organization', {
        method: 'PATCH',
        body: JSON.stringify({ baseCurrency: trimmed }),
      }),
    );
  }

  return (
    <SettingsSection
      title={intl.formatMessage({
        id: 'settings.org.currency.title',
        defaultMessage: 'Base currency',
      })}
      onSubmit={handleSubmit}
      error={error}
      submitting={submitting}
      readOnly={readOnly}
      saveLabel={intl.formatMessage({
        id: 'settings.org.currency.save',
        defaultMessage: 'Save base currency',
      })}
      saveDisabled={trimmed.length !== 3 || trimmed === value}
      notice={
        !value &&
        !readOnly && (
          <Alert severity="info">
            {intl.formatMessage({
              id: 'settings.org.currency.notSet',
              defaultMessage:
                'Not set yet. Stock received before it is set waits for a cost.',
            })}
          </Alert>
        )
      }
    >
      <CurrencyField
        id="organization-base-currency"
        label={intl.formatMessage({
          id: 'settings.org.currency.title',
          defaultMessage: 'Base currency',
        })}
        value={currency}
        onChange={setCurrency}
        disabled={readOnly}
        helperText={intl.formatMessage({
          id: 'settings.org.currency.help',
          defaultMessage:
            'What stock is valued in: CAD, USD. It cannot change once stock carries a value in it.',
        })}
        sx={{ maxWidth: 240 }}
      />
    </SettingsSection>
  );
}

const POLICY_LABEL = defineMessages({
  block: { id: 'settings.org.policy.block', defaultMessage: 'Refuse' },
  override: {
    id: 'settings.org.policy.override',
    defaultMessage: 'Refuse unless overridden, with a reason',
  },
  allow: {
    id: 'settings.org.policy.allow',
    defaultMessage: 'Allow, and record it',
  },
});

const POLICIES: LicencePolicy[] = ['block', 'override', 'allow'];

/**
 * What release does with the licence on a run's recipe (ADR-050). One rule
 * cannot fit every regime — an NPN never expires, an export certificate
 * does, and whether work may go on during a renewal depends on who issued
 * it — so the organization chooses.
 *
 * Withdrawn has no setting: it is always refused, because withdrawal is a
 * decision somebody made. Overriding needs production.override_licence,
 * which only the Owner holds unless a role is given it.
 */
function LicencePolicyForm({
  organization,
  readOnly,
  onSaved,
}: {
  organization: OrganizationProfile;
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const [notInForce, setNotInForce] = useState(
    organization.licenceNotInForcePolicy,
  );
  const [expired, setExpired] = useState(organization.licenceExpiredPolicy);
  const [required, setRequired] = useState(organization.licenceRequired);

  const { submitting, error, submit } = useSubmit(onSaved, {
    success: intl.formatMessage({
      id: 'settings.org.licence.saved',
      defaultMessage: 'Licence policy saved',
    }),
  });

  const unchanged =
    notInForce === organization.licenceNotInForcePolicy &&
    expired === organization.licenceExpiredPolicy &&
    required === organization.licenceRequired;

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(() =>
      api('/organization', {
        method: 'PATCH',
        body: JSON.stringify({
          licenceNotInForcePolicy: notInForce,
          licenceExpiredPolicy: expired,
          licenceRequired: required,
        }),
      }),
    );
  }

  return (
    <SettingsSection
      title={intl.formatMessage({
        id: 'settings.org.licence.title',
        defaultMessage: 'Licences at release',
      })}
      onSubmit={handleSubmit}
      error={error}
      submitting={submitting}
      readOnly={readOnly}
      saveLabel={intl.formatMessage({
        id: 'settings.org.licence.save',
        defaultMessage: 'Save licence policy',
      })}
      saveDisabled={unchanged}
    >
      <Typography variant="body2" color="text.secondary">
        {intl.formatMessage({
          id: 'settings.org.licence.intro',
          defaultMessage:
            'Checked when a run is released, against the licence on its recipe. A withdrawn licence is always refused.',
        })}
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          id="organization-licence-not-in-force"
          label={intl.formatMessage({
            id: 'settings.org.licence.notInForce',
            defaultMessage: 'Not yet in force',
          })}
          select
          fullWidth
          value={notInForce}
          onChange={(event) =>
            setNotInForce(event.target.value as LicencePolicy)
          }
          disabled={readOnly}
          helperText={intl.formatMessage({
            id: 'settings.org.licence.notInForce.help',
            defaultMessage: 'Issued from a date still to come.',
          })}
        >
          {POLICIES.map((policy) => (
            <MenuItem key={policy} value={policy}>
              {intl.formatMessage(POLICY_LABEL[policy])}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          id="organization-licence-expired"
          label={intl.formatMessage({
            id: 'licences.status.expired',
            defaultMessage: 'Expired',
          })}
          select
          fullWidth
          value={expired}
          onChange={(event) => setExpired(event.target.value as LicencePolicy)}
          disabled={readOnly}
          helperText={intl.formatMessage({
            id: 'settings.org.licence.expired.help',
            defaultMessage:
              'Past its expiry date, such as a renewal still pending.',
          })}
        >
          {POLICIES.map((policy) => (
            <MenuItem key={policy} value={policy}>
              {intl.formatMessage(POLICY_LABEL[policy])}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <FormControlLabel
        control={
          <Switch
            checked={required}
            onChange={(event) => setRequired(event.target.checked)}
            disabled={readOnly}
          />
        }
        label={intl.formatMessage({
          id: 'settings.org.licence.required',
          defaultMessage: 'A recipe must carry a licence to be released',
        })}
      />
    </SettingsSection>
  );
}

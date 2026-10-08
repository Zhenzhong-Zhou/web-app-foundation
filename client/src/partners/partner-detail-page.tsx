import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { type ReactNode, useState } from 'react';
import { useIntl } from 'react-intl';
import { useParams } from 'react-router-dom';

import { HistoryButton } from '../audit/history-button';
import { useCan } from '../auth/permissions';
import { PageHeader } from '../components/page-header';
import { LoadFailure } from '../errors/load-failure';
import { api, messageFor } from '../lib/api';
import { openDialog } from '../lib/open-dialog';
import { useRecordOpened } from '../lib/recent';
import type { Address, Contact, PartnerDetail } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { PartnerPriceLists } from '../price-lists/partner-price-lists';
import { AddressDialog } from './address-dialog';
import { ContactDialog } from './contact-dialog';
import { EditPartnerDialog } from './edit-partner-dialog';
import { PartnerDocumentLanguages } from './partner-document-languages';

function formatAddress(address: Address): string {
  return [
    address.line1,
    address.line2,
    address.city,
    address.region,
    address.postalCode,
    address.country,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * Everything about one partner: its own fields, where it ships and invoices,
 * and who to talk to.
 *
 * One request, not three. The server embeds both child collections because a
 * detail view always wants them (ADR-028), and every mutation below refetches
 * the whole thing — the page is small, and a partial update that misses a
 * demoted default is a harder bug than a second fetch is a cost.
 */
export function PartnerDetailPage() {
  const intl = useIntl();
  const { id } = useParams<{ id: string }>();
  const can = useCan();

  const {
    data: partner,
    error,
    failure,
    setError,
    loading,
    reload,
  } = useResource<PartnerDetail>(`/partners/${id}`);
  // Remembered as recently opened, once loaded (ADR-058).
  useRecordOpened('partner', id, partner !== null && partner !== undefined);
  const [editingPartner, setEditingPartner] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [addingAddress, setAddingAddress] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [addingContact, setAddingContact] = useState(false);

  const canEdit = can('partners.update');
  const showSkeleton = useDelayedFlag(loading);

  async function retireAddress(address: Address) {
    try {
      await api(`/partners/${id}/addresses/${address.id}`, {
        method: 'DELETE',
      });
      await reload();
    } catch (caught: unknown) {
      // Surfaced at the page, not in a dialog: the refusal for a default
      // address arrives from a button with no form behind it.
      setError(messageFor(caught));
    }
  }

  async function retireContact(contact: Contact) {
    try {
      await api(`/partners/${id}/contacts/${contact.id}`, {
        method: 'DELETE',
      });
      await reload();
    } catch (caught: unknown) {
      setError(messageFor(caught));
    }
  }

  if (loading) {
    return showSkeleton ? (
      <Stack spacing={2}>
        <Skeleton height={48} />
        <Skeleton height={180} />
        <Skeleton height={180} />
      </Stack>
    ) : null;
  }

  if (error && !partner) {
    return (
      <LoadFailure
        failure={failure}
        message={error}
        missingTitle={intl.formatMessage({
          id: 'status.missing.partner',
          defaultMessage: "This partner doesn't exist",
        })}
        list={{
          to: '/partners',
          label: intl.formatMessage({
            id: 'layout.nav.partners',
            defaultMessage: 'Partners',
          }),
        }}
        onRetry={() => void reload()}
      />
    );
  }
  if (!partner) return null;

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[
          {
            label: intl.formatMessage({
              id: 'layout.nav.partners',
              defaultMessage: 'Partners',
            }),
            to: '/partners',
          },
        ]}
        title={partner.name}
        status={
          partner.isActive
            ? undefined
            : {
                label: intl.formatMessage({
                  id: 'common.retired',
                  defaultMessage: 'Retired',
                }),
                color: 'default',
              }
        }
        actions={
          <Stack direction="row" spacing={1}>
            <HistoryButton resourceId={partner.id} />
            {canEdit && (
              <Button
                variant="text"
                onClick={openDialog(() => setEditingPartner(true))}
              >
                {intl.formatMessage({
                  id: 'common.edit',
                  defaultMessage: 'Edit',
                })}
              </Button>
            )}
          </Stack>
        }
        subtitle={
          [partner.code, partner.taxId].filter(Boolean).join(' · ') ||
          intl.formatMessage({
            id: 'partners.noCodeOrTaxId',
            defaultMessage: 'No code or tax ID',
          })
        }
      />

      {error && <Alert severity="error">{error}</Alert>}

      {partner.notes && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {partner.notes}
          </Typography>
        </Paper>
      )}

      <Section
        title={intl.formatMessage({
          id: 'partners.addresses',
          defaultMessage: 'Addresses',
        })}
        onAdd={canEdit ? () => setAddingAddress(true) : undefined}
        addLabel={intl.formatMessage({
          id: 'partners.address.add',
          defaultMessage: 'Add address',
        })}
        empty={intl.formatMessage({
          id: 'partners.addresses.empty',
          defaultMessage:
            'No addresses yet. An order needs somewhere to ship to.',
        })}
        rows={partner.addresses}
        renderRow={(address) => (
          <Stack
            key={address.id}
            direction="row"
            spacing={2}
            sx={{ alignItems: 'flex-start', p: 2 }}
          >
            <Box sx={{ flexGrow: 1, opacity: address.isActive ? 1 : 0.5 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography variant="subtitle2">
                  {address.label ??
                    intl.formatMessage({
                      id: 'partners.address.untitled',
                      defaultMessage: 'Address',
                    })}
                </Typography>
                {address.isDefault && (
                  <Chip
                    label={intl.formatMessage({
                      id: 'partners.address.default',
                      defaultMessage: 'Default',
                    })}
                    size="small"
                    color="primary"
                  />
                )}
                {address.isBilling && (
                  <Chip
                    label={intl.formatMessage({
                      id: 'partners.address.billing',
                      defaultMessage: 'Billing',
                    })}
                    size="small"
                  />
                )}
                {address.isShipping && (
                  <Chip
                    label={intl.formatMessage({
                      id: 'partners.address.shipping',
                      defaultMessage: 'Shipping',
                    })}
                    size="small"
                  />
                )}
                {!address.isActive && (
                  <Chip
                    label={intl.formatMessage({
                      id: 'common.retired',
                      defaultMessage: 'Retired',
                    })}
                    size="small"
                  />
                )}
              </Stack>

              <Typography variant="body2" color="text.secondary">
                {formatAddress(address)}
              </Typography>
            </Box>

            {canEdit && address.isActive && (
              <Stack direction="row">
                <Button
                  variant="text"
                  size="small"
                  onClick={openDialog(() => setEditingAddress(address))}
                >
                  {intl.formatMessage({
                    id: 'common.edit',
                    defaultMessage: 'Edit',
                  })}
                </Button>
                <Button
                  variant="text"
                  size="small"
                  onClick={() => void retireAddress(address)}
                >
                  {intl.formatMessage({
                    id: 'partners.retire',
                    defaultMessage: 'Retire',
                  })}
                </Button>
              </Stack>
            )}
          </Stack>
        )}
      />

      <Section
        title={intl.formatMessage({
          id: 'partners.contacts',
          defaultMessage: 'Contacts',
        })}
        onAdd={canEdit ? () => setAddingContact(true) : undefined}
        addLabel={intl.formatMessage({
          id: 'partners.contact.add',
          defaultMessage: 'Add contact',
        })}
        empty={intl.formatMessage({
          id: 'partners.contacts.empty',
          defaultMessage:
            'No contacts yet. Someone has to answer when an order is late.',
        })}
        rows={partner.contacts}
        renderRow={(contact) => (
          <Stack
            key={contact.id}
            direction="row"
            spacing={2}
            sx={{ alignItems: 'flex-start', p: 2 }}
          >
            <Box sx={{ flexGrow: 1, opacity: contact.isActive ? 1 : 0.5 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography variant="subtitle2">{contact.name}</Typography>
                {contact.isPrimary && (
                  <Chip
                    label={intl.formatMessage({
                      id: 'partners.contact.primary',
                      defaultMessage: 'Primary',
                    })}
                    size="small"
                    color="primary"
                  />
                )}
                {!contact.isActive && (
                  <Chip
                    label={intl.formatMessage({
                      id: 'common.retired',
                      defaultMessage: 'Retired',
                    })}
                    size="small"
                  />
                )}
              </Stack>

              <Typography variant="body2" color="text.secondary">
                {[contact.role, contact.email, contact.phone]
                  .filter(Boolean)
                  .join(' · ')}
              </Typography>
            </Box>

            {canEdit && contact.isActive && (
              <Stack direction="row">
                <Button
                  variant="text"
                  size="small"
                  onClick={openDialog(() => setEditingContact(contact))}
                >
                  {intl.formatMessage({
                    id: 'common.edit',
                    defaultMessage: 'Edit',
                  })}
                </Button>
                <Button
                  variant="text"
                  size="small"
                  onClick={() => void retireContact(contact)}
                >
                  {intl.formatMessage({
                    id: 'partners.retire',
                    defaultMessage: 'Retire',
                  })}
                </Button>
              </Stack>
            )}
          </Stack>
        )}
      />

      {/* Needs the lists to name them; saving needs partners.update. */}
      {can('price_lists.view') && (
        <PartnerPriceLists
          key={`${partner.salePriceListId}:${partner.purchasePriceListId}`}
          partnerId={partner.id}
          salePriceListId={partner.salePriceListId}
          purchasePriceListId={partner.purchasePriceListId}
          readOnly={!canEdit}
          onSaved={reload}
        />
      )}

      {/* What this partner's documents print in (ADR-054). Remounted when
          the saved pair changes, as the price lists above are. */}
      <PartnerDocumentLanguages
        key={`${partner.documentLanguage}:${partner.documentSecondLanguage}`}
        partnerId={partner.id}
        documentLanguage={partner.documentLanguage}
        documentSecondLanguage={partner.documentSecondLanguage}
        readOnly={!canEdit}
        onSaved={reload}
      />

      <EditPartnerDialog
        key={editingPartner ? partner.id : 'partner-closed'}
        partner={editingPartner ? partner : null}
        onClose={() => setEditingPartner(false)}
        onSaved={reload}
      />

      {/**
       * Keyed on the row being edited, so the form is seeded from props at
       * mount and never needs an effect to resync. A key on the inner Dialog
       * would rebuild MUI's element while useState kept its first value.
       */}
      <AddressDialog
        key={
          editingAddress?.id ??
          (addingAddress ? 'address-new' : 'address-closed')
        }
        partnerId={partner.id}
        address={editingAddress}
        open={addingAddress || !!editingAddress}
        onClose={() => {
          setAddingAddress(false);
          setEditingAddress(null);
        }}
        onSaved={reload}
      />

      <ContactDialog
        key={
          editingContact?.id ??
          (addingContact ? 'contact-new' : 'contact-closed')
        }
        partnerId={partner.id}
        contact={editingContact}
        open={addingContact || !!editingContact}
        onClose={() => {
          setAddingContact(false);
          setEditingContact(null);
        }}
        onSaved={reload}
      />
    </Stack>
  );
}

/**
 * The two collections render identically apart from their rows, so the frame
 * is shared. Not extracted to its own file: it has no state, no props anyone
 * else would pass, and lifting it would make two files to read instead of one.
 */
function Section<T>({
  title,
  rows,
  renderRow,
  empty,
  addLabel,
  onAdd,
}: {
  title: string;
  rows: T[];
  renderRow: (row: T) => ReactNode;
  empty: string;
  addLabel: string;
  onAdd?: () => void;
}) {
  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1 }}>
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          {title}
        </Typography>

        {onAdd && (
          <Button variant="text" onClick={onAdd}>
            {addLabel}
          </Button>
        )}
      </Stack>

      <Paper variant="outlined">
        {rows.length ? (
          <Stack divider={<Divider />}>{rows.map(renderRow)}</Stack>
        ) : (
          <Typography color="text.secondary" sx={{ p: 3 }}>
            {empty}
          </Typography>
        )}
      </Paper>
    </Box>
  );
}

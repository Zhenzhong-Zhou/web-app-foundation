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
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { useAuth } from '../auth/use-auth';
import { PageHeader } from '../components/page-header';
import { api, ApiError } from '../lib/api';
import { openDialog } from '../lib/open-dialog';
import type { Address, Contact, PartnerDetail } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { AddressDialog } from './address-dialog';
import { ContactDialog } from './contact-dialog';
import { EditPartnerDialog } from './edit-partner-dialog';

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

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
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();

  const [partner, setPartner] = useState<PartnerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingPartner, setEditingPartner] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [addingAddress, setAddingAddress] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [addingContact, setAddingContact] = useState(false);

  const canEdit = !!session?.permissions.includes('partners.update');
  const loading = partner === null && error === null;
  const showSkeleton = useDelayedFlag(loading);

  const load = useCallback(async () => {
    if (!id) return;
    setPartner(await api<PartnerDetail>(`/partners/${id}`));
    setError(null);
  }, [id]);

  useEffect(() => {
    let ignore = false;

    void api<PartnerDetail>(`/partners/${id}`)
      .then((row) => {
        if (!ignore) setPartner(row);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, [id]);

  async function retireAddress(address: Address) {
    try {
      await api(`/partners/${id}/addresses/${address.id}`, {
        method: 'DELETE',
      });
      await load();
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
      await load();
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

  if (error && !partner) return <Alert severity="error">{error}</Alert>;
  if (!partner) return null;

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[{ label: 'Partners', to: '/partners' }]}
        title={partner.name}
        status={
          partner.isActive ? undefined : { label: 'Retired', color: 'default' }
        }
        actions={
          canEdit && (
            <Button
              variant="text"
              onClick={openDialog(() => setEditingPartner(true))}
            >
              Edit
            </Button>
          )
        }
        subtitle={
          [partner.code, partner.taxId].filter(Boolean).join(' · ') ||
          'No code or tax ID'
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
        title="Addresses"
        onAdd={canEdit ? () => setAddingAddress(true) : undefined}
        addLabel="Add address"
        empty="No addresses yet. An order needs somewhere to ship to."
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
                  {address.label ?? 'Address'}
                </Typography>
                {address.isDefault && (
                  <Chip label="Default" size="small" color="primary" />
                )}
                {address.isBilling && <Chip label="Billing" size="small" />}
                {address.isShipping && <Chip label="Shipping" size="small" />}
                {!address.isActive && <Chip label="Retired" size="small" />}
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
                  Edit
                </Button>
                <Button
                  variant="text"
                  size="small"
                  onClick={() => void retireAddress(address)}
                >
                  Retire
                </Button>
              </Stack>
            )}
          </Stack>
        )}
      />

      <Section
        title="Contacts"
        onAdd={canEdit ? () => setAddingContact(true) : undefined}
        addLabel="Add contact"
        empty="No contacts yet. Someone has to answer when an order is late."
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
                  <Chip label="Primary" size="small" color="primary" />
                )}
                {!contact.isActive && <Chip label="Retired" size="small" />}
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
                  Edit
                </Button>
                <Button
                  variant="text"
                  size="small"
                  onClick={() => void retireContact(contact)}
                >
                  Retire
                </Button>
              </Stack>
            )}
          </Stack>
        )}
      />

      <EditPartnerDialog
        key={editingPartner ? partner.id : 'partner-closed'}
        partner={editingPartner ? partner : null}
        onClose={() => setEditingPartner(false)}
        onSaved={load}
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
        onSaved={load}
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
        onSaved={load}
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

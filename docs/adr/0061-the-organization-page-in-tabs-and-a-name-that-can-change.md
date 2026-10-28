---
status: accepted
date: 2026-10-09
---

# ADR-061 — The Organization page in tabs, and a name that can change

## Context

Settings → Organization is one page of small forms, each with
its own Save: tax registration, registered address, base currency, the
default sale price list, document languages and licences at release.
ADR-060 adds branding, the expiry days and a printing choice. Nine forms on
one page is long on a desk and very long on a phone, mixes paperwork with
money, looks and rules, and gives nothing a link can point to: Getting
started can only send an owner to the top of the page. And the name, set at
registration, cannot be changed at all.

## Decision — five tabs, each with its own address

| Tab | Holds | Address |
| --- | --- | --- |
| Profile | The name, tax registration, registered address | `/settings/organization` (the first) |
| Money | Base currency, the default sale price list | `/settings/organization/money` |
| Documents | Document languages, the names required on invoices, "Print the logo" (ADR-060) | `/settings/organization/documents` |
| Stock | Expiry days (ADR-060), licences at release | `/settings/organization/stock` |
| Branding | Logo, colour, sidebar (ADR-060) | `/settings/organization/branding` |

- ADR-055's tabs, scrolling sideways on a phone. Each form keeps its own
  Save; switching tab with unsaved changes asks first, as leaving any page
  does (#54).
- Every member may read every tab but Branding, as they read the page now;
  only those with `organizations.update` change anything.
- **Links open the tab they mean.** Getting started's address step opens
  Profile; the refusal to issue an invoice without a registered address
  links to Profile; Home's Expiring card says "within 90 days" and, for
  those who may change it, links that to Stock.

## Decision — the name can change

On the Profile tab, for whoever has
`organizations.update`, 1 to 120 characters, audited like every change to
the organization.

- Nothing already issued changes: an invoice or credit note copies the
  seller's name and address on the day it is issued (ADR-046), so renaming
  never rewrites paper already sent.
- From the save on, the app, new documents and new emails carry the new
  name. The organization's slug, used in nothing a customer sees, stays.
- Why now: a business that changes its logo usually changes its name with
  it, and the name was only fixed because renaming was undecided.

## Consequences

- Built in this order, before ADR-060's code:
    1. The tabs on the Claude Design canvas: Profile with the name, Documents
       and Stock, beside ADR-060's Branding.
    2. The client: the five tabs and their addresses, the sections moved
       into them, the links into them. No server change.
    3. The name: in the organization's update and its audit, and on the
       Profile tab.
- The current single page's address keeps working: it is Profile.

*Amended while building:*

- **The address is `?tab=money`, not `/settings/organization/money`**,
  as on every record page: the same `useTab`, which keeps the open tab in
  the address, falls back to the first for an unknown one, and replaces
  history rather than adding to it. `/settings/organization` is Profile.
- **Every tab stays mounted, and only the open one shows**, so moving
  between tabs keeps whatever was typed. Nothing needs to ask: no work is
  lost by switching, and leaving the page is as it was.
- **The name is 1 to 100 characters**, as at registration, not 120.
- **Four tabs until ADR-060 is built**: Branding arrives with it, and so do
  the expiry days on Stock and, with them, Home's link to Stock.
- **Links built now:** Getting started's first step opens Profile, as the
  page's own address; the base currency notes on Stock value and on
  Exchange rates open Money. The refusal to issue an invoice without an
  address is the server's message, shown as it comes, with no link yet.

*Amended (12 October 2026):*

- **The refusal to issue links to Profile.** The server puts
  `code: "organization_address_missing"` beside its message
  (conventions.md, "Error codes"), and the Issue dialog shows, under the
  message, a link to Profile for whoever holds `organizations.update`;
  anyone else gets the message alone, as Profile is a page they cannot
  change. Only the address is refused: the tax number stays optional, as
  ADR-046 left it, since a business not registered for GST/HST has none
  to print. MC-1703.
- **The customer's billing address the same way.** Refused for a customer
  with no billing address (`customer_billing_address_missing`), the dialog
  links to the customer's page, for whoever holds `partners.update`.
  MC-702.

## Considered and not done

- **One long page with an index down the side.** Shorter to build, and
  still one long page on a phone, where the index is the first thing to go.
- **A page per group in the menu.** Five settings entries where there is one
  now, for forms most people change once.

## Deferred — each with what brings it in

- **A "ready to invoice" summary** at the top of Profile: address set, tax
  number set. Getting started covers a new organization. Trigger: an
  organization that dismissed Getting started and is then refused an
  invoice for something missing.

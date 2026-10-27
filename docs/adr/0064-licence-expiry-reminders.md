---
status: accepted
date: 2026-10-09
---

# ADR-064 — Licence expiry reminders: told at 60, 30 and 7 days, and on the day

**Context.** A licence with an expiry date shows on Home's Licences card
from 60 days out (ADR-058), and release checks it the day it runs
(ADR-050). Nobody is told. A licence that lapses is found by the run it
stops, or by whoever happens to open Home. Issue #17 asks for a notice
at 60 days. ADR-036 deferred exactly this kind of event, an absence
rather than an action, because nothing is looking: it needs a scheduled
check, and a rule for when that check does not run.

**Decision — four notices per expiry date: 60, 30 and 7 days before, and
on the day.**

- 60 days is #17's and Home's: time to start a renewal. 30 and 7 are the
  reminders a renewal that has not started needs. The day itself says it
  is the last day, and what release does from tomorrow (ADR-050).
- Each notice is sent once per licence per expiry date. A licence whose
  date changes, a renewal, starts again from the notices its new date
  calls for.
- The days stay fixed: ADR-060 kept licence notice out of what an
  organization edits.

**Decision — told to those who can act.** Everyone in the organization
who holds `product_licences.update`, who can renew or correct it, or
`production.release`, whose runs it stops. Targeting by permission, as
ADR-036 does; one notification per person, in their language
(ADR-054), linking to the Licences page.

**Decision — a check that catches up.** Hourly while the server is up,
as the file purge runs (ADR-059), over every organization. It sends, for
each active licence with an expiry date, the latest notice its date
calls for and it has not had: a server asleep for a week sends the
7-day notice, not the 30 and the 7 together. On the day, or within a
week after when the server was down, the expiry notice says it has
expired. Older than that, nothing: a licence long expired is Home's and
release's to show, not news.

**Decision — never twice.** The licence row records the expiry date and
the last notice sent for it, and a notice is claimed by updating that
row only if it has not moved, in one statement, before anything is
sent. Two instances, or two hours, cannot both claim one. A claim whose
sending fails is not retried: emission never fails, and a missed notice
is the lesser loss than a repeated one (ADR-036).

**Consequences.**

- Migration 0053: `product_licences.expiry_notice_for` (the date the
  notices count down to) and `expiry_notice_days` (60, 30, 7 or 0, the
  last sent).
- A notification type, `licence.expiring`, and the bell's link to
  Licences.
- Withdrawn licences and those with no expiry date are never told about.
- "Today" is the UTC day, as every licence date is compared (ADR-050,
  ADR-052).

**Considered and not done.**

- **Notifying everyone in the organization.** A viewer cannot renew a
  licence or run production; the bell is for what someone can act on.
- **A notice every day of the last week.** Seven alike teach people to
  clear the bell without reading it.
- **Email.** In-app only, as ADR-036 decided; the trigger below.

**Deferred — each with what brings it in.**

- **Email for licence notices.** Trigger: a licence lapsing while
  nobody who would have acted opened the app.
- **An organization's own notice days.** Trigger: a regime where 60
  days is too short to renew.

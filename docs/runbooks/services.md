# Services the project depends on

One page for every outside service: what it does here, where its
settings are written, which secrets and settings it needs, and what moving
off it would take. Settings and secrets are named, never given: their
values live in each service's own dashboard, and the development ones in
`.env`, which is never committed. The goal for every row is that moving
off it is a matter of settings, not code. Checked on 25 October 2026.

## In production

| Service | What it does here | Where its settings are written | Secrets and settings, by name | Moving off it |
| --- | --- | --- | --- | --- |
| **Render** | The API (a web service), the client (a static site) and PostgreSQL | [render.md](render.md): what runs where, building the services from nothing, deploys, the header rules | Every server setting in `.env.example`, on the web service; the `VITE_*` settings on the static site, read only when it builds | Any host that runs Node and serves static files, and any PostgreSQL 18: [render.md](render.md), "Building the services from nothing"; "Replacing the database" |
| **Cloudflare R2** | Uploaded files (ADR-059), and the encrypted backups (ADR-053) | [render.md](render.md) for the files; [restore.md](restore.md) for the backups, their buckets, logins and drill | `FILE_STORAGE` and the `FILES_*` settings; GitHub's `BACKUP_*` secrets and variables | Any S3-compatible store: its endpoint, bucket and logins. [restore.md](restore.md), moving to another host or bucket |
| **Resend** | Sends every email (`RESEND_API_KEY`), from `MAIL_FROM`, `Panivo <no-reply@wide-naturals.ca>` | Resend's dashboard; the domain's records at Namecheap | `RESEND_API_KEY`, `MAIL_FROM` | Any email service: the app sends by Resend's API or plain SMTP (`MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`), so another service needs settings and its DNS records, not new email code |
| **Namecheap** | Holds `wide-naturals.ca`, the domain email is sent from, and its DNS | Namecheap's dashboard, Advanced DNS | None in the repository | The domain can move registrar with its records |
| **GitHub** | The repository (public), Actions, Dependabot, the ruleset for `main`, the `production` environment | `.github/workflows/`; [render.md](render.md), "Setting it up, by hand, in this order", for the environment and the ruleset | `production`: `RENDER_API_DEPLOY_HOOK`, `RENDER_CLIENT_DEPLOY_HOOK`; repository: the `BACKUP_*` secrets and variables, `CLAUDE_CODE_OAUTH_TOKEN` | Another CI means rewriting the workflows; the code and its history move with git |
| **Anthropic** | Claude Code Review on each pull request, and Claude Code's cloud sessions | `.github/workflows/claude-code-review.yml` and `claude.yml` | `CLAUDE_CODE_OAUTH_TOKEN` | Nothing in the app depends on it |
| **healthchecks.io** | The backups' heartbeat: emails when a day passes without a backup (ADR-053) | healthchecks.io's dashboard | `BACKUP_HEALTHCHECK_URL`; unset, the step is skipped | Any heartbeat monitor: its URL |
| **UptimeRobot** | Asks `/api/health` and the site every 5 minutes and emails Bob when either stops answering, since 25 October 2026; its pings keep the free API awake, about 744 of the 750 free hours Render gives a month | UptimeRobot's dashboard, the free plan: two HTTP(s) monitors, `https://web-app-foundation-client.onrender.com/api/health` and `https://web-app-foundation-client.onrender.com/`, and no more. Decline the monitors it offers on common paths (`/blog`, `/cart`, `/pricing`, `/wp-admin` and so on): the static site answers every path with `index.html` and a 200, so each would check the same file again and multiply the alert emails. The 11 it added were deleted on 26 October 2026 | None in the repository | Any uptime monitor: the two addresses |

## Email's DNS (25 October 2026)

`wide-naturals.ca` at Namecheap holds Resend's records:

- **DKIM:** a TXT record at `resend._domainkey`, verified.
- **SPF:** CNAME records at `send` and `rsend`, pointing at Resend Forge,
  verified.
- **DMARC:** a TXT record at `_dmarc`, `v=DMARC1; p=none;`, which asks
  mail apps to deliver what fails rather than reject it. It stays so,
  with no report address, until the first paying customer (Bob, 25
  October 2026); then it takes a report address (`rua`) and tightens to
  `quarantine` once the reports show every message passing, likely on
  Panivo's own sending domain by then (below). The reports need a mailbox
  on the domain first (*Not set up yet*).

In Resend: Forge on, sending enabled, receiving off, open and click
tracking off (tracking rewrites every link, the sign-in and reset links
included), TLS opportunistic, the region North Virginia (`us-east-1`).
The free plan's limits, as last known: about 3,000 emails a month and
100 a day. The daily one is the first a busy day of invitations would
meet.

The domain is Bob's own, the one available today. A sending domain of
Panivo's own is deferred to the first customers (ADR-082).

## Not set up yet

- **An error tracker:** Sentry's free Developer plan, decided in
  [ADR-084](../adr/0084-an-error-tracker.md) (#287) and set up by hand
  after its deploy. Personal details are scrubbed before anything is
  sent, and browser errors go through the app's own API, so the browser
  contacts no other site.
- **A mailbox on `wide-naturals.ca`,** for when one is wanted: a
  support address, or DMARC's reports at the first paying customer
  (Bob, 26 October 2026). Forward through ImprovMX's free plan, with two
  MX records on `@`: `mx1.improvmx.com` at priority 10 and
  `mx2.improvmx.com` at 20, beside Resend's MX on `send`. Never
  Namecheap's own Email Forwarding: a custom MX turns it off, and
  switching to it would drop Resend's record. Postmark's free DMARC tool
  (`dmarc.postmarkapp.com`, no Postmark account needed) refuses Gmail
  addresses, so it needs an address on the domain first.

## On a developer's machine

- **Docker** runs PostgreSQL 18 and Mailpit (`localhost:8025`): the
  README's setup.
- **Playwright's Docker image** runs Firefox and Linux WebKit where they
  cannot start on macOS; the commands are in #232.
- **The pre-push hook** comes from `scripts/hooks/`, set once per clone by
  `git config core.hooksPath scripts/hooks`.

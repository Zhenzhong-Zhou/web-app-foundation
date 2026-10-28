---
name: production-readiness
description: Review whether the deployed app is ready for real users, across eight sections (deploys and old tabs, backups and a restore tried, monitoring, security, performance, email, support, browsers and China), against this repository's ADRs and runbooks, and report findings with their evidence plus a by-hand list. Use for /production-readiness, before the first real customer's data, before a release, or after a change of host or plan. Report only.
---

# Production readiness

Answer one question with evidence: could a real customer start using the
deployed app tomorrow, and what would hurt them first? Judge against what
this repository has already decided (the ADRs, `docs/runbooks/`, Open
decisions in `docs/adr/open-decisions.md`), not general taste. Report; change
nothing, here or in production.

## Rules

- **Read only.** Never change a setting, a workflow, a secret or a
  database; never run `npm run org:invite`, a migration or a seed against
  anything but your own dev database. Against the live site, only `GET`
  and `HEAD` with `curl`, and only its public addresses.
- **Never print a secret.** No database URL, key, token or password goes
  into the report, a command's output you quote, or an issue. A check that
  needs one is a By hand step.
- **Evidence or "not checked".** Every finding names what shows it. When
  the evidence is out of reach (a dashboard, an account you cannot open),
  say "not checked" and why, and put the check in the By hand list.

## 1. Scope

- `/production-readiness` reviews every section.
- `/production-readiness <section>` reviews one, by its heading below
  (`deploys`, `backups`, `monitoring`, `security`, `performance`, `email`,
  `support`, `browsers`).

The live site's address comes from `PRODUCTION_URL` if it is set;
otherwise ask for it. The API answers under it at `/api/…`, so its health
is `$PRODUCTION_URL/api/health`.

## 2. Read the rules it touches

`CLAUDE.md`, then `docs/runbooks/render.md` and `docs/runbooks/restore.md`,
[the README's Deployment section](../../../README.md#deployment), [the handoff's *Still to do, by hand*](../../../docs/handoff.md#still-to-do-by-hand), and
the ADRs each section names. Note the date each runbook check was last
done; a check older than a change of host, plan or region is stale.

## 3. Check

### Deploys and old tabs (ADR-081)

- **What is live.** `curl -s $PRODUCTION_URL/api/health` names the commit
  and the API revision; compare the commit with the newest one on `main`
  that CI ran on (`gh run list --workflow ci.yml --branch main --event push
  -L 1 --json headSha,conclusion`), and the revision with
  `server/src/common/api-revision.ts`. A push of docs alone runs no CI and
  deploys nothing (`ci.yml`'s `paths`), so `main` ahead of the live commit
  by such pushes is as it should be. Behind CI's newest commit, a run that
  failed deployed nothing: say so; one that passed is a deploy that failed
  or never ran: find out which.
- **The order.** Both services deploy only through the deploy workflow
  (`deploy.yml`): the API at the commit CI passed, then the static site
  once `/api/health` names it. Its last runs (`gh run list --workflow
  deploy.yml -L 5`), each deploying both, ending with the live-site check
  green, or saying why it deployed nothing; `gh secret list --env
  production` naming `RENDER_API_DEPLOY_HOOK` and
  `RENDER_CLIENT_DEPLOY_HOOK`, `gh secret list` naming neither, and
  `gh variable list` naming `API_HEALTH_URL` (names only, never values);
  `gh api repos/{owner}/{repo}/environments/production` limiting
  deployments to `main`; and, by hand, Auto-Deploy off on the web service
  and on the static site ([`render.md`, Deploys](../../../docs/runbooks/render.md#deploys-adr-081)). Deploy by hand (Actions →
  Deploy → Run workflow) offered, and run once since the last release.
- **The version file and caching.** `curl -sI` on `/version.json`,
  `/index.html` and one `/assets/*.js` named in the live `index.html`:
  the first two never cached, the asset for a year and immutable
  (`render.md`). `version.json`'s build matches the live commit.
- **Old files.** `render.md`'s old-files check: its date, and whether the
  host or plan changed since. If so, it goes in the By hand list with the
  runbook's steps.
- **The API revision.** `server/openapi.json`'s `info.version`,
  `client/src/api/` and `api-revision.ts` agree; the contract job runs
  oasdiff; since the last release, every breaking change raised it (read
  `git log -p origin/main -- server/openapi.json` back to the last tag).
- **Migrations against the running release.** Every migration since the
  last release leaves working what the previous release reads: no drop,
  rename, type change or new required column without a default, unless a
  squawk ignore comment beside it says why. CI's squawk step exists and
  ran.
- **The switch and the way back.** By hand: the web service's health check
  path is `/health/ready`. `render.md` says a rollback takes both services
  back together.

### Backups and a restore tried (ADR-053, ADR-059)

- **Runs.** `gh run list --workflow backup.yml -L 7` and
  `--workflow restore-drill.yml -L 3`: the nightly backups green, and a
  drill within the last month that restored and checked rows.
- **Where they go.** `BACKUP_DESTINATION` must be `s3`, to the Canadian
  bucket with object lock, before real data; Actions artifacts are for
  testing ([`restore.md`, section 1](../../../docs/runbooks/restore.md#1-one-time-setup)). Files in R2 copied nightly (ADR-059).
  The values are By hand; the workflow's own logs may show the
  destination's kind without a secret.
- **The database's plan.** By hand: free (expires; no point-in-time
  recovery) or paid, and its creation date against the handoff.
- **A restore by a person.** By hand: the last time someone followed
  `restore.md` end to end; never, or before a change of host, is a
  finding.

### Monitoring

- **Logs.** Production logs JSON through pino; every error response
  carries the request id the crash page shows (the exception filter). By
  hand: one reference from a crash page found in Render's logs.
- **Health.** `/health` and `/health/ready` answer; the readiness probe
  checks the database.
- **Being told.** An uptime check on `/api/health/ready` from outside, and
  an error tracker for the server and the client (Open decisions, "The
  operator"): absent is a finding, with that entry's trigger. GitHub's
  email for a failed workflow, backups above all, reaches someone who
  reads it (By hand).
- **Jobs that run hourly** (licence reminders, deletions, the files purge,
  the invitation sweep) do not run while a free web service sleeps
  (`render.md`): a finding before real users.
- **The database's own record.** `pg_stat_statements` on from the first
  day of real use ([ADR-051, "Production, beyond these measurements"](../../../docs/adr/0051-performance.md#production-beyond-these-measurements)).

### Security (Open decisions, "A security review before real customers")

- **Secrets.** Nothing secret committed (`.gitguardian.yaml` runs on
  pushes; spot-check `git log -p` for keys); every development secret
  replaced before real data ([`render.md`, "Before real customers' data"](../../../docs/runbooks/render.md#before-real-customers-data)),
  By hand.
- **The API's edges.** helmet on every response; the session cookie
  httpOnly, Secure and SameSite=Lax (ADR-011, ADR-014); rate limits on
  sign-in, sign-up, reset and invitations (`@Throttle`); CORS absent, as
  the README says it must be.
- **The client's headers.** A Content-Security-Policy set at the host
  (#142), allowing `data:` images; `curl -sI $PRODUCTION_URL/` shows what
  is sent.
- **Who can get in.** `REGISTRATION=invitation` in production (ADR-078);
  two-factor sign-in for Owners (not built: Open decisions); two-factor on
  the Render, GitHub, Cloudflare and Resend accounts (By hand).
- **Dependencies.** `npm audit` in `server/` and `client/`, and code
  scanning alerts if `gh` can read them, each new one against the reason
  given on the alert or its issue (#270, for Dependabot alert 4), and
  [ADR-019's rule on overrides](../../../docs/adr/0019-peer-dependency-conflicts-are-never-overridden.md).
- **Tenancy.** Every controller added since the last review has an e2e
  test that another organization's id is refused (ADR-003).

### Performance (ADR-051)

- **The workflow.** `gh run list --workflow perf.yml -L 5`: the weekly
  full run on `main` green, and the last release candidate's.
- **The watch list.** [ADR-051's *Watch, each with its trigger*](../../../docs/adr/0051-performance.md#watch-each-with-its-trigger) and the
  open issues on a budget (`gh issue list --search 'budget in:title'`),
  each trigger checked against the last report.
- **Cold starts.** A free web service waits about a minute on its first
  request: a finding before real users.
- **The client.** Bundle sizes from `npm run build` in `client/`, and
  Lighthouse on the live site, warm and just woken (By hand); unmeasured
  is a finding, with
  [Open decisions, "Performance budgets"](../../../docs/adr/open-decisions.md#performance-budgets).
- **Waiting deletes.** ADR-070's foreign keys without an index:
  `EXPLAIN ANALYZE` an organization's deletion on `seed:volume` before the
  first large customer.

### Email

- **The sender.** Production sends through Resend from `MAIL_FROM`, a
  domain we own.
- **The domain.** `dig +short TXT <domain>`, the DKIM record Resend gives
  (`dig +short TXT resend._domainkey.<domain>`) and
  `dig +short TXT _dmarc.<domain>`: SPF, DKIM and DMARC present and
  aligned.
- **DMARC, tightened in steps, from the first paying customer.** At
  `p=none` the record only watches: a message forged in the domain's name
  is still delivered. Until the first paying customer, `p=none` with no
  `rua` is deferred by decision (Bob, 25 October 2026): report it as
  deferred, not as a finding, and check by hand that the app's own mail
  passes (Gmail, Show original: SPF, DKIM and DMARC all PASS). From the
  first paying customer, by hand: add a report address
  (`rua=mailto:…`), read a few weeks of the daily reports it brings, until
  every service that sends as the domain, a mailbox provider as well as
  Resend, passes SPF or DKIM aligned, then raise the policy to
  `p=quarantine`, on Panivo's own sending domain if the move has happened
  by then (ADR-082, Deferred). From then, a record still at `p=none`, or
  with no `rua`, is a finding, with how many weeks of reports have been
  read.
- **Delivery.** By hand: one of each email (confirm, reset, invitation, a
  licence reminder) reaches Gmail, Outlook, and a QQ or 163.com address,
  where confirmation and reset mail can be delayed or filtered, not in
  spam, in the reader's language.
- **Bounces.** Resend's dashboard shows bounces and complaints; someone
  looks at it (By hand).

### Support

- **Being reached.** A customer can find how to reach us from the app
  (Help, the crash page) and from an email's footer.
- **From a report to the cause.** The reference on the crash page and in a
  refusal leads to one log line (Monitoring).
- **Acting for a customer.** `npm run org:invite -- --list` for what
  waits; the operator's console and support access are not built (Open
  decisions): note what a support request could not be answered with
  today.
- **What customers are promised.** Terms, a privacy notice (PIPEDA; PIPL
  for customers in China), where data is kept (Canada) and for how long
  (ADR-012, ADR-069, ADR-070): missing is a finding before real users.

### Browsers and China (ADR-081; [conventions.md, "Supported browsers"](../../../docs/conventions.md#supported-browsers))

- **The floor.** `vite build`'s target, `eslint-plugin-compat`'s settings
  and conventions.md's list name the same browsers.
- **Nothing from another site.** No `http://` or `https://` host other
  than our own in `client/src/`, `client/index.html` or the built
  `client/dist/`, the font bundled and no analytics, CDN or Google
  service.
- **The engines.** `index.html` asks 360, QQ and Sogou for their Chromium
  engine (`renderer`, `X-UA-Compatible`).
- **Reaching it from China.** By hand: a 拨测 site (17ce.com, boce.com) on
  the live address from several mainland cities; slow or blocked is a
  finding: the fix would be a Hong Kong or Singapore region on our own
  domain, or an ICP filing to host inside China.
- **Newer than the floor's lint.** `eslint-plugin-compat` sees nothing
  after about ES2022 and no CSS (#197): search `client/src/` for newer
  built-ins (`Object.groupBy`, `Promise.withResolvers`, `Array.fromAsync`,
  `toSorted`, `AbortSignal.any`, `Intl.DurationFormat`) and CSS above the
  floor (`:has(`, `subgrid`, `@starting-style`), each guarded or within
  the browsers conventions.md lists.
- **Devices.** By hand: Android WeChat, 360 or QQ on Windows in 极速模式
  (the ⚡ icon), and an iPhone on iOS 16.4 or later; each signs in, opens
  an order and switches to 中文.
- **Tablets, foldables and odd shapes.** By hand, or Playwright at those
  sizes: an iPad mini and an iPad Air upright, an iPad held sideways and in
  Split View; a foldable folded and unfolded, the iPhone Duo closed and
  open; a phone held sideways (about 390 px tall). Look for a dialog's
  buttons below the fold, a wide table on a phone (#159), touch targets
  under 44 px (#170) and anything that needs hover.

## 4. Report

Open with one line: ready for real users, or not yet, and the one thing
that would hurt them first. Then the findings, most serious first:

- **Before real users**: real people or their data would be at risk, or
  something they rely on would quietly not happen.
- **Before the first paying customer**: what a contract or a support
  request would need.
- **Worth considering**: the three most valuable only, then one line
  saying how many were left out.

Write each as the section, what is wrong, its evidence (a `path:line`, a
workflow run, a command and its output, a runbook line), the ADR, runbook
or Open decisions entry it ties to, and the fix or the decision needed. A
finding that only a decision can settle names its Open decisions entry
and trigger rather than proposing code.

Then **By hand**: numbered steps for Bob, each saying where to click or
what to run, and what result counts as done. Then **Sound**: one line per
section with nothing to report. If nothing is wrong, say so plainly
rather than inventing findings.

## 5. When asked

- **Keep the report:** write it to `review/production-readiness-<date>.md`
  (ignored by git).
- **File issues:** one per finding, by `gh issue create`, its title what
  is wrong and its body the finding as written, without secrets.

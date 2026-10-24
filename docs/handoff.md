# web-app-foundation — handoff, 24 October 2026

Paste this into the new chat. Re-sync Project knowledge from `main` first, so
the new session reads current code.

## Now, 24 October 2026: read this first

The sections after this one are the longer history; where they disagree
with this one, this one is current.

- **The brand, ADR-082** (`adr-082-brand`, from 24 October 2026): its
  ADR is the branch's first commit; the designs on the canvas come next,
  then the build brief in `tmp/adr-082/`. Bob's ten decisions, each in
  ADR-082: an ADR of its own, so low stock becomes ADR-083; Panivo before
  sign-in and "Powered by Panivo" at the rail's foot, the organization's
  after; the mark in the product's emails, a hosted PNG with the name in
  text, never in an invitation; no mark on an organization's documents;
  the © holder and a name per language as settings,
  `VITE_COPYRIGHT_HOLDER` (Zhenzhong (Bob) Zhou, until a registered
  business's name) and `VITE_APP_NAME_ZH_HANS` (品桥); one icon on a navy
  plate wherever the browser, the system or a mail app paints the
  background, chosen on the canvas; a web manifest,
  `apple-mobile-web-app-title`, `theme-color`, a card for a shared link,
  and the mark while the app loads; the colours unchanged, since
  ADR-055's accent and dark rail are the mark's own; Help's foot naming
  the product. Riding along: #225's known miss,
  the pre-push hook in `scripts/hooks/` with a CI check behind it, multer
  2.5.0 by override (Dependabot's alert 6), `eslint-plugin-testing-library`
  and tests for `scripts/i18n-review.mjs`. **At its merge, by hand:** the
  static site's three new settings, set before the merge's deploy.
- **`main` was red from #224 to #231** (23 to 24 October 2026). On a
  push CI runs every browser, but a pull request runs Chromium only
  unless it is labelled `full-e2e`, and #224 was not. Its new rows in
  `accessibility.spec.ts` pushed the one test that opened every screen
  past its 120 seconds in Firefox, where axe runs slowest. #227's run,
  the scheduled one and #228's failed too, Deploy skipped each,
  and the live site stayed at #217's merge. #231 (fixing #230) made each
  screen its own test, in each mode, under reduced motion; it deployed
  with the four merges behind it on 24 October (4e58ebc), the API by its
  hook from the `production` environment. Its branch filed #232: two
  WebKit contrast checks that measure a colour mid-change, 4 times in 60
  runs, passing on a retry. A pull request that changes the look across
  many screens carries `full-e2e`, as `ci.yml`'s comment says; #196's
  should have.
- **#196, colours by path in `sx`:** merged as #224 (fa89912) on 23
  October 2026. MUI 9's Typography had drawn 218 dotted colours as
  primary text since 2 September; MUI's codemod moved them into `sx`,
  and a lint rule refuses a dotted colour prop. ADR-055's amendment says
  what building settled, and which four values stay muted on purpose.
  After the merge: the `production` environment limited to `main`, both
  hooks moved into it and deleted from the repository's secrets (24
  October); MC-3424 walked at #231's deploy, an open tab offering the new
  version; MC-3502 walked; MC-3501 walked, its icon's dark version nearly
  invisible on a light Chrome theme with the system dark (ADR-082).
  Still to do: Deploy by hand once (MC-3425).
- **Merged on 24 October 2026, besides #224:** #227 (#187, the plan
  check at large, with its docs; it filed #225 and #226), #228 (#213,
  quantities with padding zeros), #229 (#223, Recently opened's kinds in
  sentence case) and #231 (#230). Of the three fixes given to cloud
  sessions, #221 stopped before any code. The order page's content is
  capped at 1200 px (`Container maxWidth="lg"`) and its summary is a
  fixed `rem(300)`, so the Items table has about 796 px at any wider
  window, and its pinned Actions covers Total; at 125% text it has about
  720 px for about 1,000 needed (an estimate). Wrapping Item, pinning
  Total, more room or fewer columns each change ADR-055's tables, so
  #221 is decided with #159's design.
- **Merged on 23 October 2026, besides #196:** #200 (#189, the bell's
  failed list), #201 (Panivo's tab icon and name), #202 (#190, Resend),
  #203 (#193, request fields on one log line), #204 (#195, a failed list
  shows only the failure), #205 (#194, `npm run api` apart from the dev
  server), #207 (#206, a flaky refusals test), #208 (#184, typographic
  apostrophes and a check), #209 (#180, `membership_roles.csv`), #211
  (#210, tests wait for what an effect does, and the flaky-test rule),
  #216 (#130, money from its digits), #217 (#138, a contact with no way to
  reach it refused in words), #218 (the weekly flake hunt), #219 (#186,
  the organization on every join in the lookup, checked at large the same
  day), #220 (#215, the empty-list screenshot). Filed the same day: #212
  (Help's Esc before the guide loads), #213 (quantities with padding
  zeros), #214 (a voided shipment's faded row), #221 (an order's Total
  column cut under Actions), #222 (the demo orders' History), #223 (Home's
  recent-work kinds in capitals).
- **ADR-081, old tabs after a deploy:** merged in #199 (1620e99) on 23
  October 2026, fixing #175 and #173; what building settled is in its
  as-built amendment. Done by hand on 22 October, before the merge: the
  free database replaced (all 75 migrations; the Backup run green once its
  secret lost `?sslmode=no-verify`); both deploy hooks as secrets,
  `API_HEALTH_URL`, Auto-Deploy Off on both services; the three header
  rules, which took effect at once, without a deploy. The merge's Deploy
  run (#1) deployed the API at 1620e99 by its hook; the wait saw 983c1d8
  three times, then 1620e99 after 1 minute 43; then the static site.
  `/api/health` and `/version.json` both named 1620e99, version 0.7.0, API
  revision 1. Deploy #2, for CI's scheduled run at 7:01, was skipped, as
  designed. The free API took about 50 seconds to wake for the first
  request. The headers are in `render.md`, "Deploys". Render's edge
  ignores a query string and empties itself at each deploy, so no page
  stays old after one (#196's review; ADR-081's correction).
- **The order after it** (Bob, 22 October 2026; the brand went first on
  24 October): **ADR-082, the brand** (above); then **ADR-083, low
  stock** (its questions in Open decisions); then the review of the whole
  app, once (`/production-readiness` with its device pass: deploys,
  backups and a restore tried, monitoring, security, performance, email,
  support, browsers and China, tablets and foldables, the iPhone Duo
  closed and open, a phone held sideways); then the fix-ups, each a PR of
  five to ten related issues: safety and scale (#181 first, then #142,
  #182, #225, #226), orders and shipping (#156, #158, #125, #161, #164,
  #128, #159 with #221, a layout decision first, and decisions #157 and
  #160), organization, roles and audit (#169, #168, #179, #174, #166,
  #133, #167), accessibility (#155, #170, #171, #162, #212, #214 with a
  row of its own in `accessibility.spec.ts`, #232), words and
  translations (#148, #149, #129, #150, with Bob's mother's corrections),
  and as a chore #222. After them, in this order unless a trigger brings
  one forward, each with its entry in Open decisions: one person in two
  organizations, then a practice organization (ADR-077, *Deferred*); a
  public demo; plans and billing; the operator's console and support
  access.
- **Claude Code's cloud sessions** (Bob's $250 credit, which ends in early
  November) took the small fixes listed above, one branch and PR each;
  on 24 October, #228 and #229, while #221 stopped with its findings, as
  its stop rule asks. What they taught is in the working agreements,
  "Cloud sessions": a new session per task, a stop rule in every prompt,
  the session as committer (its commits then show Verified), regression
  numbers named when several run at once, and a sweep or a load proof
  kept to the Mac. One sweep in a long session ran over half an hour.
- **ADR-080, job roles** (`adr-080-job-roles`): merged in #176. Roles an
  organization makes, from a template or a copy, several to a member and
  added together; the built-in three fixed; a role given only by someone
  whose roles hold all it grants; prices on orders a permission of their
  own; Settings → Roles; migrations **0073** and **0074**. It fixed #147
  and #151, with parts of #148, #155 and #169 left; what building settled
  is in ADR-080's as-built amendment, and its reviews filed #177 to #184.
- **Onboarding, a chain of three** (Bob's priority, 19 October 2026), one
  PR each, ADR first: done with ADR-079's merge (#152).
    1. **ADR-077, invitations** (`adr-077-invitations`): merged (#143).
       Invite replaces Add member, by email or a
       copied link, each link working to the end of its seventh day in
       the organization's zone; `POST /v1/users` is gone, and no route
       sets another person's password. Migration **0068**
       (`invitations`, and `auth_tokens.invitation_id` in an exclusive
       arc with `user_id`). Members has Invite and Invited, cards and a
       full-screen dialog on a phone; the invitation page is among the
       signed-out pages at `/invitation`; Getting started's seventh step
       reads Invite your team. Settled while building, each in ADR-077:
       Admins act on no Owner's invitation; the account takes the
       invitation page's language; the audit log keeps who invited which
       address, the 30-day sweep removing the invitation's row alone;
       `invitations.csv` is in the export, its columns in the README's
       glossary; a failed send reads Email not sent; an expired
       invitation still blocks a new one, and Resend starts it again; an
       account with no organization signs in through sign-in, then
       accepts, and one due for deletion keeps it first; the mockups'
       role lines in one voice; the read carries the logo inline and the
       organization's deletion day; `delivery: "link"` makes an
       invitation by Copy link with no email; the email is as designed,
       signed by `MAIL_FROM`'s name; an invitation is the
       organization's, so once its inviter has left or deleted their
       account the email and the page name the organization alone; the
       page names the inviter by address too, as the email does, and an
       ended link is refused with `invitation_ended`. Settled on the
       screens, not in the ADR: Revoke asks first; Invited is hidden while nobody is
       pending; Getting started opens the dialog through `?invite`,
       which closing takes off; the demo's own accounts start confirmed.
       The browser suite reads mail back from Mailpit's API (CI maps
       8025), and confirming an email follows `THROTTLE_FACTOR`. A
       name's and a new password's limits are constants in
       `common/dto/account-rules.ts`, the duplication watch having
       reached three DTOs.
       - **Before merging:** walk section 30 and MC-1559 on a demo
         seeded on this branch, in English and 中文, one invitation
         emailed through Mailpit. A local database that ran 0068 before
         the Admin role line changed keeps the old line until
         `update roles set description = 'Day-to-day work: stock,
         orders, production and drafting invoices. Can invite and remove
         members.' where is_system and name = 'Admin'`, the line since
         0072; a fresh one needs nothing.
    2. **ADR-078, registration by invitation** (`adr-078-registration`):
       merged (#146). Eight commits: the ADR and five
       points from its discussion, the schema (0069), the server, the
       command, the tests, the client, these docs. `REGISTRATION`, open or
       by invitation, production by invitation when unset; the sign-up
       route refused before it reads anything. `npm run org:invite` on a
       laptop against production's database, asking each question when run
       bare, printing the link and a message to send; `OPERATOR_EMAIL`,
       if set, hears of each acceptance. The organization is made when the
       invitation is accepted, its first Owner unconfirmed until they
       confirm. An account with no organization starts one by invitation,
       or from Home where registration is open. What building settled is
       in ADR-078's as-built amendment. Render's web service has
       `REGISTRATION=invitation` and `OPERATOR_EMAIL` since 20 October
       2026, and `npm run org:invite -- --list` ran against production.
    3. **ADR-079, a newcomer's first sign-in** (`adr-079-first-sign-in`):
       merged (#152). A welcome card on Home, the
       member's own for two weeks from joining: what they can do here, from
       their permissions; the inviter's note; and a first week ticked by what
       they do. Help in the top bar and in the card opens the page's guide, 21
       in three languages, kept with the client and checked by a test; beside
       the page on a laptop, with the rail folded, and full screen on a phone.
       Learn more on empty lists, Getting started's steps and the hard
       settings. Your access on Account; the inviter told in the bell; New on
       People. #144 fixed. Migrations **0070** to **0072**. Permissions
       brought in line with what they gate: `users.update` dropped, a role
       change needs `roles.assign`, the roles list `roles.view`. What building
       it settled is in ADR-079's as-built amendment.

- **ADR-076, the audit log in words (`adr-076-audit-in-words`):** no
  migration; server and client. Every screen with an audit entry (the
  audit log, a record's History, Your activity, your recent work on
  Account, a person's recent work) and the audit CSV read in the
  reader's language, with no id anywhere a person reads. A reference is
  named when its row is written, keeps that name after a rename, and
  opens its record where it has a page the reader may open; a shipment
  reads as its order's number and opens its order. Every key a payload
  may hold is declared with its name in each language and how its value
  reads; `@Audited`, `recordPrevious`, `recordContext` and
  `AuditService.record` cannot record an undeclared one, and an e2e test
  reads what the compiler does not see: a row written straight to the
  table, and an export's filters. One formatter on the server words each
  entry for the screens and the CSV; the client renders what it is
  given, and its own action names and field labels are gone. Old rows
  are read, not rewritten: a reference in one reads as its kind in
  words. Closes the known edge on field names in an audit entry, and the
  audit log's part of #129. The amendment at the end of ADR-076 says what
  building settled; ADR-018, ADR-038, ADR-054 and ADR-057 are amended.
  - **Before merging:** walk section 29, and look at the audit log in
    简体中文 on a demo seeded on this branch.

- **The demo's team:** merged in #140; no migration, a server feature
  with three chores riding along (below). `seed:demo` now adds nine
  colleagues across every role, with work details and last active spread
  across every coarse value; writes the audit row each seeded step's route
  would, so History, Your activity, People and the audit log start full; and
  fills what the demo never reached: a second site with every kind of
  location, variants, equipment, contacts, a customer and a supplier price
  list, a purchase in euros and a late one, a nested recipe with a
  hand-picked lot and two outputs, a cancelled run, a draft recipe version,
  an expired lot, a sale in US dollars, an RMA by replacement, and licences
  expiring and lapsed. In `seed-demo-audit.ts`, `seed-demo-team.ts` and
  `seed-demo-team-work.ts`, run after the variety and kept off the figures
  the manual checks name.
  - **Keeping it current:** CI runs `npm run seed:demo` on an empty
    database; run it locally after changing a service it calls. The
    seed builds each row with the interceptor's own `auditPayload`, but each
    step names its route's action, resource type and fields by hand, copied
    from that route's `@Audited`: change one, change the seed.
  - **Riding along:** the order page imports its Delete icon by path, so
    the dev server no longer re-bundles mid-session; nodemailer 10.1.7 and
    pdfmake 0.3.12, with pdfkit 0.20.2 (the same documents, drawn with
    both versions, came out identical but for their date and ID); and both
    packages' versions at 0.7.0, the latest tag.

- **Initials by the name's script (ADR-063 amended):** merged in #139. A
  person without a photo shows what readers of their name's script expect: a
  Chinese name its given name (周振中, 振中), Latin, Greek and Cyrillic names
  their initials, any other script its first character. Two Chinese
  characters are set smaller and marked Chinese for screen readers.

- **ADR-075, text size, and text that grows:** merged in #137. Standard,
  Large and Larger text (100%, 112.5% and 125% of the browser's own size, on
  `<html>`), in the avatar menu and on the signed-out pages, kept on each
  device; widths that hold text in rem; less motion when asked; a variant's
  chevron named for screen readers. Walking 14 screens at Larger found pages
  that scrolled sideways on a phone, nearly all at Standard too, each fixed
  where it is shared: banners, header buttons, dialog footers, date ranges,
  Home's grids, the audit log, and a hidden box 100% wide. The amendment at
  the end of ADR-075 says what building and review settled; ADR-055 is
  amended.
  - **The PR:** client only, no migration and no server change. Its
    commits: ADR-075, the rem widths, the text size, the chevron, less
    motion, seven fixes from the walk, the simplify pass, a dialog fix and
    tests from the review, header buttons as fragments, then this docs
    commit. Manual checks section 28 and MC-R15 to MC-R20, each with the
    commit that made it.
  - **Before merging:** walk MC-2801 to MC-2807 and MC-R15 to MC-R20; show
    your mom Home and an order in 简体中文 at Larger (MC-2803); have the
    new French and Chinese labels read by someone fluent. The branch was
    rebuilt to move manual checks into their commits, so run
    `scripts/verify.sh` on it before opening the PR.
  - **Next:** Bob's choice, from the features and fixes he wants before
    run numbers (ADR-074).

- **ADR-073, each organization's document numbering:** merged in #136.
  Five series (invoices, credit
  notes, RMAs, sale and purchase orders), each with a prefix that may carry
  `{YYYY}`, `{YY}`, `{MM}` and `{DD}`, a width, a reset (never, yearly,
  monthly, daily) and its next number, set by an Owner on Settings →
  Organization → Documents → Numbering. The document's own date picks the
  period; an earlier period stays open and keeps its prefix, so a December
  invoice issued in January reads like the rest of its year. Two refusals
  keep one number naming one document, and a date-order switch, off by
  default, is France's rule. Today's numbers are the defaults, so nothing
  changes until an Owner changes it. The amendment at the end of ADR-073
  says what building settled; ADR-046, ADR-047, ADR-056 and ADR-071 are
  amended. ADR-074 records run numbers and batch codes from them, decided
  and deferred, so other features and fixes come first.
  - **Migration 0067** (each organization's five numbering rows; counters
    by period): run `npm run migrate:all` wherever it has not run yet.
  - **By hand, if not yet done:** walk MC-2701 to MC-2713; show your mom
    编号 on a phone (MC-2710); have the new French and Chinese drafts read
    by someone fluent.

- **ADR-072, each organization's time zone (#41):** merged in #134. An IANA zone per organization, set
  at registration from the browser and by an Owner on Profile, decides
  the organization's day: licences at release and their reminders, the
  rate a receipt takes, expiring stock, Home (now without `?today=`,
  ADR-058 amended), every export's file name, the days on documents,
  dialogs' default dates, and date ranges on lists of moments, at the
  organization's midnight (ADR-057 amended). Moments stay UTC; screens
  show times in each reader's own zone; deletion days are unchanged. The
  amendment at the end of ADR-072 says what building and review settled.
  - **The PR:** migration **0066**, so its description says to run `npm
    run migrate:all`; "Fixes #41" and "Fixes #127" (duplicate React keys,
    a commit of its own). It also carries the registered address's change
    logged with what it replaced (MC-R13), the audit log's To keeping its
    last day (MC-R14), and the in-range dependency updates with js-yaml
    4.3.2 under the type generator.
  - **Right after the deploy:** set each organization's zone on Settings →
    Organization → Profile. Every organization from before starts on UTC,
    and until it is set, Home and days left follow UTC: tomorrow, from
    5 pm in Vancouver. Render's Node must carry time-zone data 2026b or
    later (`node -p process.versions.tz`; 2026a predates it): British
    Columbia stays on UTC−7 from 1 November 2026, and older data would
    begin Vancouver's days an hour late. Homebrew's Node reads Homebrew's
    own ICU, which can lag; `nvm` and CI carry Node's bundled copy.
  - **Next** was ADR-073, above.

- **On `main`:** ADR-055 to ADR-066, all built and merged: the UI pass,
  search, dates and export, Home, file storage (R2), branding, the
  Organization page in tabs, product images, people (photos, the People
  page, last active), licence expiry reminders (#17), staying signed in
  (Keep me signed in, an organization's idle sign-out), covers in the
  lookup, the gallery's zooming viewer, and the invoice refusals' links to
  Organization → Profile and to the customer (`invoice-refusal-link`,
  ADR-061 amended, with a `code` beside a refusal's message: conventions.md,
  "Error codes"). Since then, through #124: ADR-067 to ADR-070 below,
  and `deletion-started` (#117).
- **Migrations:** through **0074** on `main`, 75 files in
  `server/src/database/migrations/`. 0055 and 0056 are ADR-069's (#114);
  0057 to 0061 are ADR-070's (#116): the deletion day, the reminder, and
  whose account goes with it (0059 put it on the organization, 0060 moved
  it to the account, 0061 added its check and the trigger that clears it
  when a membership ends). 0062 is #117's, merged in #124: the mark a run
  takes before it erases an organization's files. `adr-071-documents`
  adds **0063** (order numbers, every existing order numbered), **0064**
  (each organization's paper size) and **0065** (Deliver to and Send back
  to, filled in for existing orders and RMAs), merged in #132.
  `adr-072-time-zone` added **0066** (each organization's time zone),
  merged in #134; `adr-073-numbering` **0067** (numbering, #136);
  `adr-077-invitations` **0068** (invitations, #143);
  `adr-078-registration` **0069** (organization invitations, #146);
  `adr-079-first-sign-in` adds **0070** (the welcome's dismissal),
  **0071** (`users.update` dropped) and **0072** (the Admin's stored line
  says invite), in #152; `adr-080-job-roles` **0073** (membership and
  invitation roles) and **0074** (`roles.updated_by`), in #176. Render
  holds one row per file in `drizzle.__drizzle_migrations` once `main` is
  deployed there: 75 with ADR-080. After any new migration: `npm run migrate:all`, and
  check its journal time (*Working agreements*, Process).
- **ADR-067** (the server's tests on Vitest, then Nest 12 and
  intl-messageformat 12): built and merged (#90, #91). TypeScript 7 waits
  for typescript-eslint and the Nest CLI (ADR-067, *Deferred*); still so
  on 21 October 2026, with typescript-eslint 8.72.0 accepting `<6.1.0`,
  the Nest CLI 12.0.10 depending on TypeScript `~6.0.2`, and
  `@nestjs/swagger` 12.0.2 accepting up to 6 (ADR-019's table).
- **ADR-046 amended:** a taxed invoice needs the seller's tax number,
  refused with `organization_tax_number_missing` and linked to Profile
  (`invoice-tax-number`, MC-711). Tax profiles by country are deferred in
  the same amendment, until the first customer or legal entity outside
  Canada.
- **ADR-068** (#19): merged; phase 1 was built on `adr-068-openapi`. The server writes
  `server/openapi.json`, the client's types are generated from it into
  `client/src/api/`, the four shared lists come from them, and one contract
  check in CI and `scripts/verify.sh` replaces the four copy checks. After
  any API change: `npm run api` in `server/`, and commit both files.
  Phase 2 runs straight through, one PR per group of modules, before
  ADR-069; the steps are in conventions.md, "The API contract". Done: tax
  codes (the pilot), invoices and credit notes (`invoices-responses`,
  which settled the page class and found `CreditNoteSummary` declared
  twice), orders (`orders-responses`, then `orders-shipments-responses`
  for shipments, returns and holds, with stock availability), stock and
  locations (`stock-responses`; the lot trace goes with production, whose
  licence fields it carries), costs (`costs-responses`, whose raw rows
  were all unknown until typed), products and product licences
  (`products-responses`). Since `response-contract`, the e2e suite holds
  every JSON response to the document with its objects closed, so each
  conversion is checked as it lands. BOMs and price lists followed
  (`boms-responses`), then partners (`partners-responses`), production
  runs with the lot trace (`production-responses`), RMAs
  (`rmas-responses`), the person's own account (`account-responses`: me,
  sign-in, devices, photo, work details; events went ahead with
  partners), the organization's people and settings
  (`organization-responses`: members, people, roles, profile, uploads).
  The last group followed (`remaining-responses`: audit with account
  activity, notifications, home, recent, lookup, health), so every JSON
  response is declared and checked. Phase 2 closed with `types-ts-removed`:
  `client/src/lib/types.ts` is gone, the client imports the generated
  types from `client/src/api/types.gen`, and the few names screens switch
  on (`OrderStatus`, `CalendarDay`) live in `client/src/lib/api-names.ts`,
  each read from a generated type. #19 is done.
- **Principles and skills** (`principles-and-skills`):
  `docs/principles.md`, a draft drawn from the ADRs for Bob to edit;
  `CLAUDE.md`, the rules in brief with four working habits adapted from
  the Karpathy-derived guidelines; and two project skills,
  `/code-review` (this repository's rules, replacing the bundled one) and
  `/usability-walkthrough` (a task walked as a persona from
  `personas.md`). `scripts/verify.sh` now runs the Markdown check
  first.
- **Security fixes** (`security-fixes`, #113): CodeQL's first scan of
  `main` found six alerts, all fixed. The SVG check in
  `server/src/core/files/sniff.ts` backtracked exponentially on a run of
  comments that never reaches `<svg`: about 140 fit in the kilobyte it
  reads, enough to hold the event loop for good, so one upload could stop
  the server answering anyone. It now reads the prolog one item at a
  time. `ci.yml` and `perf.yml` declare `contents: read`.
  `@scarf/scarf`'s install script, from `swagger-ui-dist`, is denied in
  `allowScripts`, and `scarfSettings` turns its reporting off. Dependabot's
  alerts and `npm audit`'s findings are left open on purpose: all
  dev-only, and none fixed in a release of the package that brings it in.
  js-yaml sits under the type generator, which reads only our own spec;
  esbuild under drizzle-kit, in a dev server it never starts; braces under
  eslint-plugin-check-file, given patterns only from our own lint config
  (Dependabot dismissed that alert itself). They close when those
  packages ship fixed dependencies. `npm audit fix --force` would
  downgrade drizzle-kit and the generator instead, and ADR-019 rules out
  overrides.
- **ADR-069** (`adr-069-account-deletion`, merged in #114): leaving an
  organization, deleting your account after 30 days, and exporting your
  own data.
  Only the person deletes their account; an Owner removes a member. The
  only member of an organization, and its only Owner while others
  remain, can do neither (`only_member`, `last_owner_with_members`).
  The deletion day is a calendar day, completed once it has ended in
  every time zone; `AccountDeletionTimer` runs at startup and hourly,
  cancelling a deletion a block now applies to. Migrations 0055 and
  0056. Waiting on their triggers (ADR-069, *Deferred*): invitations
  (ADR-006), and with them switching between organizations, which a
  block in another organization needs; and accounts an organization owns,
  through single sign-on.
- **ADR-070** (`adr-070-organization-deletion`, merged in #116):
  closing an organization. Any Owner, with the password and the
  organization's name typed, after a full export (a ZIP: a CSV per table
  it owns, `members.csv`, `role_permissions.csv`, the files) taken in the
  last 24 hours, or a decline. Thirty days, cancellable by any Owner
  until the day has ended everywhere; a banner for every member (hidden
  for today, never in the last week or once under way); every member
  emailed when it is scheduled, 7 days before, cancelled and done. Then
  the timer erases the files, moves the members' sessions, and deletes
  the audit log and the organization, every table it owns following by
  cascade. The only member deletes both in one step, recorded on the
  account (`users.deletion_with_organization_id`, cleared with the
  account's day, and by a trigger when the membership ends), the
  organization first. The session says where a
  deletion stands, `deletionStage`, on the server's UTC day.
  Backups keep it until they age out and never bring it back (ADR-069
  says the same). The service lives in `core/auth` beside account
  deletion; the export in `core/organizations`, through `TenantDb`, its
  transaction ending once the last table is read. #116 also carried
  its chores: read-only commands for Claude Code, the review skill's
  labelled findings, one `HourlyTimer` (ADR-059 amended), in-range
  dependency updates, the refusal-code rule in CLAUDE.md and the review
  skill brought to `error-codes.ts`'s (inside the manual-checks commit),
  and the session's three reads together. Manual checks MC-2401 to
  MC-2406. Three ADR-070 amendments were committed after the code they
  describe; #116's description says which. What it left waiting is filed
  as #117 to #122, under *Open issues* below.
- **Release:** **v0.7.0** was tagged and released on 16 October 2026,
  its notes in `docs/releases/v0.7.0.txt` and the GitHub release. Before
  it, **v0.7.0-rc.2** was tagged on `main` at #114's merge, a GitHub
  pre-release whose notes list the SVG upload fix from #113, which rc.1
  (after #93, Nest 12) lacks; the Performance workflow its tag started
  passed on 14 October 2026. #116 (ADR-070) merged after rc.2, so v0.7.0
  carries closing an organization as well.
  v0.6.0 and v0.5.0's notes are the GitHub releases and `docs/releases/`.
  Release notes are release notes only: they say nothing of manual checks
  or the walkthrough.
- **ADR-071** (#118): built on `adr-071-documents`, its PR to open.
  - **Built:** six documents as PDFs drawn on the server with pdfmake, in
    Noto Sans and Noto Sans SC, each character in a font that has it: the
    invoice, credit note and packing slip in their ADR-055 look, and the
    purchase order, pro forma invoice and RMA as designed on the canvas.
    Print opens the PDF and Download PDF saves it; the print pages and
    `PrintSheet` are gone. Every page's foot names the document and the
    page; the logo, and the paper, Letter or A4 per organization or
    automatic from the country, are the letterhead's. The two amendments:
    orders numbered SO- and PO- when created, and a site's own address for
    a purchase order's Deliver to and an RMA's Send back to, with who
    raised the document. The export adds `documents/`, every invoice's
    and credit note's PDF, a column glossary in its README in the language
    its link names (`?locale=`), and times as a spreadsheet opens them,
    which every CSV export now writes (ADR-057 amended).
  - **The PR:** migrations 0063 to 0065 (above), so its description says
    to run `npm run migrate:all`, and "Fixes #118". It also names the
    ADR-057 amendment that rides in 5615e94, the manual checks 07e5fe8,
    60597a3 and 5541010 updated only later, and c48ca07, the crash page's
    Go back, a fix from outside ADR-071.
  - **Remaining:** walk MC-2501 to MC-2512 and MC-R12 before merging. The
    PDF routes' and the export's performance budgets are deferred under
    ADR-071, until the first `npm run perf` on the volume seed after the
    merge (ADR-051). v0.7.0 was tagged on 16 October 2026. Numbering
    settings, an organization's prefixes, digits and next number, are
    ADR-073, after the time zone (ADR-072).
- **`after-adr-070`** (merged, #123): this handoff after #116;
  `UNSAFE_GLOBAL_DB` refused in `modules/` too; in-range dependency
  updates and jsdom 30.1.3; the account button named from the initials it
  shows, which axe-core 4.14's Label in Name rule asked for. Then the four
  fixes from ADR-070's walkthrough, each with its test and a check under
  *Regressions*: a skip link and a main landmark (#121, MC-R08); the
  Account page showing and saving the account's own language (#119,
  MC-R09); its recent work read again after its dialogs (#122, MC-R10);
  and a refused password marked on its field, with a way on, under the
  new code `password_incorrect` (#120, MC-R11).
- **Working agreements** are below: one PR per feature, ADR
  first; chores ride along; commits authored Zhenzhong Zhou
  <bob0823.zhou@gmail.com>; a file roadmap in every answer that changes
  code; designs on the Claude Design canvas
  (<https://claude.ai/artifact/RqG3iKw4V41is3w1go53EJ>) before building;
  PR title and description always given, with "Fixes #N" when it does.
  New from this round: when lint reformats a file under `client/e2e/`
  or `src/`, commit it as a fixup, never restore it (CI's format check
  covers `e2e/`). New from ADR-079: a feature is planned in this chat
  and built by Claude Code (How code is delivered).

### Still to do, by hand

- **Panivo on Render** (#201, `brand-name-and-icon`): the static site's
  Environment, `VITE_APP_NAME=Panivo`, and the web service's `MAIL_FROM`,
  `Panivo <the address it has now>` (runbooks/render.md, "Building the
  services from nothing"). The static site reads the name only when it
  builds, so set it before the merge's deploy, or deploy again after.
  Both set on 23 October, before #201 merged. MC-3501 and MC-3502 walked
  on the live app on 24 October. ADR-082 adds three settings to the
  static site, set before its merge's deploy.
- **The Chinese review:** Bob's mother has the export made at `b933b912`
  (22 October 2026); her corrections were not back on 24 October, and
  Bob says when she starts and when they come back. Let her
  finish that file: the import matches each correction by its message id,
  so it lands on whatever the catalogues hold by then, and a corrected row
  whose message has since gone is named, and nothing written until it is
  cleared. Since `b933b912`, `language.failedNewVersion` and
  `language.loadingAgain` were added and two removed, #189 added
  `layout.notifications.loadFailed`, and #138 and #196 added words of
  their own. Once hers is imported, her next round is only what changed:
  `node scripts/i18n-review.mjs export --since b933b912`, which leaves out
  #184's apostrophe-only changes. Her corrections
  go into the words-and-translations fix-up. The export covers the two
  catalogues only: not Help's guides (#150; until then she reads them in
  Help, in 中文) and not MUI's or the browser's own words, which aren't
  ours to correct. Her first note: 头像 for the profile picture
  everywhere, since Your account says 照片 while Home says 头像.
- **After #176, if not yet done:** delete `tmp/adr-080` and the branch,
  then `npm run seed` and `npm run seed:demo`; show Roles and the editor
  in 中文 on a phone to someone who reads only Chinese.
- **Render's free database** (`foundation-db`) was created on 22 October
  2026; its page says it expires on 21 November 2026, and Render deletes
  it about 5 December. Replace it by about 19 November, by
  `docs/runbooks/render.md`, "Replacing the database", and record the new
  dates here. Each free database lasts 30 days, so until a paid one this
  comes back monthly. The one before was created about 28 September and
  expired on 28 October (the 12 November an older line gave was wrong);
  the one before that was recreated on 13 October to retire a password
  pasted in a chat, the day `FILES_S3_ENDPOINT` was found ending in the
  bucket (`render.md`, "What runs where"). Before any real customer: a
  paid database and web service, backups to the Canadian bucket, and
  every development secret replaced (the runbook's "Before real
  customers' data").
- **MC-3425,** Deploy by hand once: Actions → Deploy → Run workflow,
  from `main`. It redeploys the commit already live. MC-3424 was walked
  at #231's deploy on 24 October.
- **Dependabot, 24 October 2026.** Alert 4, esbuild up to 0.24.2
  (medium, development only), stays open as #113 left it: drizzle-kit
  0.31.11's deprecated `@esbuild-kit/esm-loader` pins esbuild
  `~0.18.20`, in a dev server nothing starts; it closes with drizzle-kit
  1.0, whose fifth release candidate came out on 21 October. Alert 6,
  multer 2.4.0 (high, in production code), is pinned exactly by
  `@nestjs/platform-express` 12.2.0, the newest; its crash needs an
  asynchronous `fileFilter`, which no upload route sets, so it cannot be
  reached here. ADR-082's branch overrides it to 2.5.0 (ADR-019, amended).
- **The pre-push hook** was missing on Bob's Mac and was put back on 23
  October: `.git/hooks` is not versioned, so a fresh clone loses it.
  ADR-082 moves it to `scripts/hooks/`; once that merges, run `git config
  core.hooksPath scripts/hooks` once on each clone.
- **#187, the plan check at large: merged** as #227, from
  `fix-187-plans-at-large` (23 October 2026), with no migration; `npm run perf:plans` passes at
  small and at large. Lot search's SQL was unchanged since 2 October, but
  0042's trigram index (8 October) hands back lots unordered, so every
  match was joined before the sort, to every organization's 25,000
  variants; its join now carries the organization. Getting started's
  `exists` on products and partners stopped at its first row only for an
  organization that has one. For one with neither, the one those steps
  are for, it read every organization's 40,000 rows, so "stops at its
  first row" was no reason to allow it: both steps now take the
  organization's first row by name, limited to one, as the receipt and
  invoice steps do (ADR-058 amended). `foundation_perf_large` stays
  seeded and at every migration for #225 and #226, filed from its review.
- **Before v0.7.0:** walk sections 23 and 24 of `docs/manual-checks.md`
  (MC-2301 to MC-2303, leaving and deleting; MC-2401 to MC-2406, closing
  an organization); have the French and Chinese
  wording checked by someone fluent (MC-1405); edit `docs/principles.md`
  until it reads as Bob's.
- **Manual checks due:** MC-2601 to MC-2610, MC-R13 and MC-R14
  (ADR-072); MC-2501 to MC-2512 and MC-R12 (ADR-071); MC-1601 and
  MC-1602 (an upload in R2, the nightly copy), MC-1701 to MC-1703, MC-1801, MC-1901, MC-2001, MC-2101,
  MC-2201, and the older MC-1558 and MC-1559. Show Bob's mom 品牌, product
  photos and 同事 on a phone.
- **The walkthroughs owed by ADR-069 to ADR-076:** done in #172 (20
  October 2026), each as a persona: the PDFs and the audit log as the
  novice bookkeeper in Chinese; the time zone and the numbering as the
  owner in French on a phone; Larger text and Orders as the warehouse
  worker on a phone; leaving, deleting and closing as the novice
  bookkeeper in Chinese. Its fixes are merged, the rest filed as #154 to
  #171. Still by hand: show the close dialog to someone who reads only
  Chinese (MC-2406).
- **Open issues:** #16 (licence status for suspended, cancelled and
  superseded), #18 (site licences), #25 (what the customer kept), #33 (one
  hook for Load more keyset paging), #125 (an order page's totals can
  differ from its purchase order by a cent), #126 (MUI warns of a select
  with no options while returns load), #128 (a refused PDF opens as raw
  JSON in a new tab), #129 (English left inside translated messages), #130
  (the client's formatMoney passes amounts through Number()), #133 (the
  audit log records a field as sent, not as stored, and a few saves that
  write no entry; ADR-073's save is taken as sent, so it is not one of
  them), #138 (a contact with neither an email nor a phone fails with a
  500 rather than saying why), #142 (the client's Content-Security-Policy,
  its own PR with a short ADR), #147 (no way to
  remove a member on screen), #148 (refusals with internal or
  off-glossary wording), #149 (copy inconsistencies the guides found),
  #150 (the translation review leaves out the guides) and #151 (the
  account menu's preferences can't be opened from the keyboard). From
  `walkthroughs-older`'s walks: #154 (the lookup finds no settings, and
  invoices only by number), #155 (focus falls to the page when a dialog
  closes or a section saves), #156 (Ship suggests more than can ship, and
  no on-hand per location), #157 (receiving: prefilled or blind counts, a
  decision), #158 (Close order is the filled button while goods are due),
  #159 (order tables on a phone), #160 (four places in dialogs, a
  decision), #161 (the packing slip and the document actions, ADR-071
  follow-ups), #162 (untagged PDFs), #163 (Home's To ship lists fully
  shipped sales), #164 (issuing: the number it will get, Prints as on a
  phone, the billing-address form), #165 (the zone picker by city), #166
  (whose zone the audit log's times are in), #167 (a product's list
  prices in its History, product names, the action filter's order), #168
  (closing: 30 or 31 days, Deleted User in Chinese, buttons on a phone),
  #169 (with no organization: Members, the bell, Account's words), #170
  (touch targets under 44 px) and #171 (the credit note's info box, the
  shipment's heading); and comments on #129, #133, #148 and #149, two of
  whose items the branch fixes. #175 (old tabs after a deploy) is
  ADR-081, #199. From ADR-081's build: #186 (the lookup reads every
  organization's partners and products), #187 (the plan check at large),
  #189 (the bell's "Nothing yet." when its list failed), #190 (Resend's
  silent failure), #193 (request fields on every log line), #194
  (`npm run api`'s first run), #195 (a list's alert above its empty
  state), #196 (Typography's dotted colours, about 220 places), #197 (the
  browser floor's gaps) and #198 (unsaved work on most pages). From ADR-080's reviews: #177 (order prices in one
  object), #178 (one link that leads only where the reader may go, and
  lookups that check their own permission), #179 (Move everyone's gains
  and losses; a role deleted while being given), #180
  (`membership_roles.csv`), #181 (the audit log shows costs to readers
  without them, Admin included), #182 (permissions read twice), #183 (a
  flaky phone sign-in) and #184 (straight apostrophes); #178, #181 and
  #182 each want a decision or an ADR amendment first. #147 and #151 close
  with #176; #148, #155 and #169 keep what it leaves. #144 closed with
  #152. #131 closes with ADR-073's PR; #41 and #127 closed with
  ADR-072's. From ADR-070's
  review and its walkthrough in Chinese: #117
  (two one-second windows while a deletion completes), fixed on
  `deletion-started`, and #118 (the export's column glossary and invoice
  PDFs, also under *Open decisions* in `decisions.md`), which ADR-071
  takes up; #119 to #122 were fixed in #123. From 23 and 24 October:
  #212, #214, #221, #222, #225, #226 and #232 open; #213, #223 and #230
  closed by #228, #229 and #231. `gh issue list` to review.
- **Branches:** prune the merged ones, `after-adr-070` among them
  (`scripts/prune-branches.sh`).

### Still to do, in code

- **The brand: ADR-082** (*Now*, above). Its ADR holds what this line
  listed, from #201's `/production-readiness` findings to the © line.
- **Chores after #196:** `eslint-plugin-testing-library` for the test
  files, and tests for `scripts/i18n-review.mjs`, ride along on ADR-082's
  branch. `@mui/codemod@9.5.0`'s command crashes on yargs 18, which could
  be reported to MUI.
- **From #231.** `e2e/text-size.spec.ts` still opens every screen in one
  test, Chromium only, with 90 seconds: a candidate for the same split.
  ADR-075 kept it whole as "unlike accessibility.spec", a reason now
  gone. Playwright's Firefox does not start on Bob's Mac ("Could not find
  profile folder"), so #231 ran it on Linux from Playwright's Docker
  image as a remote browser; the commands are in #232, and the image,
  about 2 GB, is kept for the next Firefox check.
- **ADR-079's limits.** Help still slides over the page in windows under
  about 1140 px, or under about 1265 px at Large text and 1330 px at
  Larger, where a control under it can be focused out of sight (WCAG
  2.4.11). Vitest's on-disk cache does not see a guide just
  added until `npx vitest --clearCache`; CI starts without one.
- **The client has no Content-Security-Policy** (#142). Nothing in the
  repository sets one for the static site, and helmet's covers only the
  API's own responses. One set at Render must allow `data:` images
  (`img-src 'self' data:`), or the invitation page's logo, which comes
  inline (ADR-077), will not load.
- **From ADR-073's review, not its PR's.** Five dialogs still pass a
  result through a ref (create price list, raise RMA, create BOM, add
  order line, RMA detail); `useSubmit`'s success can now take the result
  instead. CLAUDE.md says a write returns the detail its read returns,
  while conventions.md says a write that returns the resource returns the
  same detail class, and the settings writes return 204. *(Settled 21
  October 2026: both now say a write returns the detail its read returns,
  or 204 when the screen reads again anyway.)*
- **Dependencies, 21 October 2026.** `npm audit` reports seven findings in
  the server's tooling (four moderate, three high), each fixable only by
  a major version; the client reports none. TypeScript 7.1's beta is out,
  and the Nest CLI waits on 7.1's API: check the blockers again once it is
  stable. On 24 October #231's branch took no update: `@nestjs/swagger`
  12.0.4 came out that day, inside the seven days.
- **From #172's reviews, not its PR's.** The contrast is fixed in ADR-081
  (#173); the Returns day is #174, and the inventory's two are #189 and
  #190. Refactors, each when its
  screen is next touched: a shared select that draws its empty choice
  ("Everywhere", "All actions", "Top level") in words rather than as a
  blank box, about nine of them; and a shared heading row whose actions
  wrap, the order's Items row being the third copy made by hand.
- **The typo lookup has failed its budget:** the weekly full Performance
  run has been red since 19 October on `GET /lookup?q=typo`, 353 ms at
  the 95th percentile against 300 (small, 10 connections). This watch
  said one query per pass if it ever failed; ADR-056's index per
  organization comes after, its trigger met (#225). ADR-082 gives that
  budget a known miss, with a 450 ms ceiling until 30 November 2026, so
  the weekly run catches anything new meanwhile; the index stays in the
  safety and scale fix-up.
- **Home** sat at 249 ms of its 300 ms budget in the same run
  (`GET /home`, small), with no watch until now. Trigger: over budget at
  small. Then its plans first, the `home` probe's.
- **An MUI warning,** logged twice by the Playwright run: "children must
  be passed when using the TextField component with select". Harmless;
  most likely the link-return dialog's select, which has no items while
  its returns load (`client/src/rmas/link-return-dialog.tsx`). Fix it
  when that screen is next touched.
- **Targeted reviews, report only:** `server/src/core/files` and
  `server/src/modules/invoices` at any quiet moment; `server/src/core/auth`
  now that ADR-070 has landed.
- **ADR-070, small and waiting:** what needs a decision or a fix is
  filed as #117 to #122 (*Open issues* above). Not filed, each small:
  - About 20 foreign keys under an organization have no index, so the
    cascade that deletes one may scan whole tables. It runs in the timer,
    not a request; `EXPLAIN ANALYZE` a deletion on `seed:volume` before
    the first large customer.
  - Playwright in CI could run against `vite build` and `vite preview`
    rather than the dev server: the shipped files, and no page reload
    when the dev server meets a new dependency mid-run, as it did once
    locally with a stale server. A chore of its own, since it lengthens
    CI.

- **ADR-077, watch list:**
  - tax-codes' "lets Admin and Viewer read but not change codes" timed
    out once under full-suite load, at Vitest's five seconds, and passes
    alone in under 200 ms: `addMember` now invites and accepts each
    member, a few more requests than Add member made. If it recurs, look
    at what the fixture spends before raising the timeout.
  - Playwright's global setup once found no confirmation email for its
    Owner in Mailpit within its ten seconds (`scripts/verify.sh`, 19
    October 2026), and the same setup passed on the next run. Nothing
    from that run's API had reached Mailpit, which took mail sent to it
    directly; a `nest start --watch` dev server on port 3000 was
    rebuilding `server/dist` at the time, which the API Playwright starts
    on port 3100 builds too. If it recurs, check whether the e2e API sent
    the email at all before raising the timeout, and try with no dev
    server running.
- **ADR-072, watch list:** each is small, and matters only when its
  moment comes.
  - The next new document passes the organization's zone to
    `documentText` itself. Its `'UTC'` default is there for specs; make
    the zone required then.
  - If the time-zone picker feels slow on a phone, build its zone list
    when it opens, not when the section does.
  - Client tests still missing: the Still on UTC note hidden on a
    computer in UTC and the picker's announcement. Add each when that
    code is next touched. ADR-078 added Home's time-zone note, naming the
    zone, and the zone sent at registration; ADR-079's fix for #144, the
    auth provider passing the zone on.
- **A browser-compatibility lint rule** (eslint-plugin-compat) set to the
  build target, so code using an API newer than the floor fails ESLint;
  the code review on initials-by-script caught Intl.Segmenter by reading.
  A chore of its own: a new dependency, and it may flag existing code.

### Deferred, each waiting for its trigger (in the ADRs)

- Brand: a registered business's name on the © line; terms and a privacy
  policy, before the first user outside Bob; the name by language in
  emails; a drawn wordmark; the mark in an organization's emails
  (ADR-082).
- Deploys: keeping the last build's files ourselves; failed loads and
  refusals sent to an error tracker; Playwright against the built files;
  feature flags and staged rollouts (ADR-081, Open decisions).
- Roles: attributes, a scope on a member's role or a condition on using a
  permission; one record shared with a customer or a supplier (a portal);
  non-Owners editing roles; a bell when your roles change; a made role's
  name in two languages; caching what a member may do (ADR-080).
- Time zones: a member's own zone for showing times; a zone per site; a
  receipt's rate day after a change of zone (ADR-072).

- Product images: a variant's own image; images on order lines and the
  shipping screen; a catalogue outside the app (ADR-062).
- People: faces in notifications and recently opened; a manager, mobile
  number and working hours; a live "online now" (ADR-063).
- Licences: email for reminders; an organization's own notice days
  (ADR-064); site licences (#18); suspended, cancelled, superseded (#16).
- Sessions: lock screen and switch user with a PIN, for a native app or
  shared scanners, handhelds or kiosks; a maximum session length
  (ADR-065).
- TypeScript 7, once typescript-eslint and @nestjs/swagger accept it and
  the Nest CLI builds with it (on 21 October 2026, typescript-eslint
  8.72.0 accepts `>=4.8.4 <6.1.0`, @nestjs/swagger 12.0.2
  `^5.5.0 || ^6.0.0`, and the Nest CLI 12.0.10 depends on `~6.0.2`;
  ADR-067).

## Where things stand

Multi-tenant B2B SaaS (NestJS + React + Drizzle + PostgreSQL 18), deployed on
Render. Inventory for a natural health products maker: buy → receive → make
under a licence → sell → ship → invoice → return and credit, with lot
traceability both ways, stock held for confirmed sales, every movement valued,
and price lists proposing the price of a new line.

- Tagged **v0.4.0-rc.1** (pre-release), deployed on Render. The final
  v0.4.0 waits for the walkthrough, a real week by hand and the BF-2609
  recall drill, run against rc.1 when Bob has time. Fixes they find go on
  `release/v0.4` (branched from rc.1), v0.4.0 is tagged there, and the
  fixes are cherry-picked into `main`.
- Tagged **v0.5.0-rc.1** (pre-release) on `main` after PR #38 (ADR-051
  part 2). The Performance workflow ran on `main` on 2 October 2026 at small
  scale and passed. Its notes are a GitHub pre-release only;
  `docs/releases/v0.5.0.txt` is written at v0.5.0's final.
- Migrations: through **0054** (staying signed in, ADR-065) on `main`.
  Render runs them on deploy (`drizzle.__drizzle_migrations` holds 55
  rows once 0054 is deployed). Next is **0055**.
  After any new migration: `npm run migrate:all` (dev, test and e2e).
- ADRs: through **ADR-053**, all built and merged: ADR-050 (licence status
  at release), ADR-051 (performance), ADR-052 (calendar days as `date`,
  #20) and ADR-053 (backups, phase 1). ADR-050, ADR-052 and ADR-053 carry
  amendments for what was settled while building; ADR-046 carries one (one
  currency per sale from the first priced line). **ADR-054** (languages)
  is written on `adr-054-languages`, not built yet. Next is **ADR-055**.
  ADR-055 (the look) is built on `ui-design-pass`, with an amendment.
  ADR-057 (dates, sorting, export) is built on `adr-057-dates-export`.
  ADR-058 (Home, with recently opened) and ADR-059 (file storage) are
  merged. **ADR-060** (branding) and **ADR-061** (the Organization page in tabs)
  are merged. **ADR-062** (product images) is built on `product-images`
  (migration 0051, MC-1801), merged (PR #78). **ADR-063** (people: a
  photo of one's own, initials otherwise, a People page) is built on
  `people` (migration 0052, MC-1901), merged (PR #79). **ADR-064**
  (licence expiry reminders, #17) is merged (PR #81). **ADR-065**
  (staying signed in) is built on `sessions` (migration 0054, MC-2101).
  **ADR-066** (covers in the lookup) is built on `lookup-covers`, after
  `sessions`. Next is **ADR-067**.
- Tests at the last local run: on `ui-design-pass` (7 October 2026),
  client vitest 210 in 44 files and Playwright 73 in CI, 71 on Bob's Mac
  (Firefox runs in CI and with `E2E_FIREFOX=1`: Playwright's build cannot
  start on his macOS); the server's as of the ADR-050 branch (2 October 2026), e2e
  627 in 33 suites (`npm run test:e2e`) and unit 36 in 6 files (`npm
  test`), and more since in stock and orders. CI also runs `seed:demo`.
- `npm run seed:demo`: BF-2609 valued at 1900.00 CAD, run FOC-2609-01 costed
  at 1292.00 over 980 bottles (1.318367 each), SO-DEMO-2 priced from the
  Wholesale CAD list (the organization default). It also leaves an RMA
  received and credited on SO-DEMO-1, a voided shipment, and PO-DEMO-2
  bought in USD at a rate of 1.37.
- **Render is up,** deployed by `deploy.yml` since ADR-081, the API first,
  then the static site. The database `foundation-db` is on the **Free
  plan**: no backups of its own, and it expires 30 days after creation (21
  November 2026 for the current one: *Still to do, by hand*). Used only to
  test with until real data; then a paid plan (ADR-053, phase 2). All 75
  migrations, through 0074, applied on 22 October 2026.

## Next, in order (as of 8 October 2026)

Done today: **Home** (ADR-058) merged, then its Performance fix
(`fix-home-perf`, PR #62: Getting started reads the ledger through its
index, and every card's count is one statement, ADR-058 amended);
**status pages** (PR #60), **recently opened** (PR #61) and the **CI
speed-up** (PR #63) merged. Home was still over budget (453 ms p95 of 300):
`fix-home-perf-2` adds the needs-cost index by pool (migration 0048), the
invoice step through its index, and the plan check reading the totals.
Merge it only once a Performance run (budgets) on the branch passes.

1. **CI speed-up**, if not merged yet: workflow files and docs only.
   Pull requests run Chromium in three shards beside the lint jobs;
   every browser on `main`, nightly and with the `full-e2e` label (create
   the label once). Performance runs the plan check on pull requests that
   change `server/src/` or `perf/`, loading the cached volume; budgets by
   hand; the full run weekly on `main` and on `v*-rc.*` tags (ADR-051
   amended). The first weekly or by-hand run on `main` fills the volume
   cache; until then a pull request's plan check seeds its own.
2. **File storage, ADR-059 written** on `adr-059-file-storage`: one
   `waf-files` bucket on R2 with its own token, a `files` table as the
   record, uploads checked and photos re-encoded on the server in three
   sizes (thumb 400 px, display 1200, full 3000 for zoom), every file
   served through `GET /v1/files/:id`, released files purged after 30
   days, copied nightly into `waf-backups/files/`, 1 GB per organization.
   Build order in the ADR: setup by hand (done: `waf-files`, its two
   tokens, the `files/` lock and lifecycle on `waf-backups`); migration
   0049 and the storage module (merged, PR #69: `src/core/files/`, the
   local and s3 drivers, the checks and three sizes, `POST
   /v1/files/logo` and `/product-image`, `GET /v1/files/:id`, the hourly
   purge; MC-1601 and MC-1602); the backup copy (built on `files-backup`:
   `scripts/backup-files.sh` after each nightly dump,
   `scripts/check-files-backup.sh` in the monthly drill, the runbook's
   "The files are gone"); then branding's logo.
3. **The Organization page in tabs, ADR-061 built** on `adr-061-org-tabs`:
   Profile, Money, Documents and Stock at `?tab=`, every tab mounted so
   switching keeps what was typed, the base currency notes linking to
   Money, and the organization's name editable on Profile (server and
   client, audited). Branding is the fifth tab, with ADR-060. MC-1701.
4. **Organization branding, ADR-060** merged (PR #76,
   migration 0050): the Branding tab with the logo previewed on both rails,
   six tested colours or a custom one saved as the nearest shade that
   passes AA and warned near the status tones, and the sidebar's shade; the
   theme following the organization through the session; the logo in the
   top bar and on printed documents unless switched off on Documents; the
   expiry days on Stock, used by every chip, the Inventory filter and Home.
   MC-1702.

Still open alongside: the **pinyin backfill** on Render's database; changing
Render's **database password** (pasted in chat); MC-1558 and MC-1559 by hand;
the typo lookup at 270 ms of its 300 ms budget (one query per pass if
it ever fails); Mailpit in the Performance workflow (only quietens harmless
email errors).

## v0.4 milestone — money

1. **Invoices for shipments** — done (ADR-046).
2. **Credit notes for returns, with RMA (#22)** — done (ADR-047).
3. **Cost on lots and batches** — done (ADR-048, server and client).
4. **Price lists** — done (ADR-049, server and client). Margin deferred by
   amendment: both an estimated margin (price against current pool cost) and
   an actual one (invoice revenue against the shipped lots' valuation rows)
   are derivable without a migration; the first real week decides which to
   build.

Then the end-of-milestone ritual, **required this time** since v0.3 skipped
it:

- look around;
- a real week by hand, including:
  - an invoice, an RMA, a partial credit and a replacement;
  - a foreign-currency purchase, and a rate entered for it;
  - a costed batch;
  - a list-priced sale;
- the timed recall drill on BF-2609.

Then tag v0.4.0.

## The UI pass (ADR-055) — built, branch `ui-design-pass`

- **Decided:** ADR-055, from mockups on a Claude Design canvas (Bob's,
  private), compared by a Chinese-reading accountant with no UI background,
  who shaped the summary panel, the expiry chips and the money labels.
  ADR-055 carries an amendment for what was settled while building.
- **Built, steps 1 to 6:** tokens and theme, the side rail, the shared
  pieces (StatusChip, ExpiryChip, DetailLayout and useTab, FilterRow,
  EmptyState, PasswordField), the order's money summary on the server, every
  screen folder moved onto them, and `accessibility.spec` (axe, WCAG 2.2 AA,
  twenty screens, both modes). No migration of its own.
- **Server reads added:** the order's money, counts, summed quantities and
  documents (`GET /v1/orders/:id`); `expiringWithin` and `needsCost` on
  `GET /v1/stock`, with `GET /v1/stock/counts`.
- **Demo:** `seed-demo-variety.ts` gives every state the screens draw one
  example, a voided invoice (SO-DEMO-6), a line closed short (PO-DEMO-6)
  and a closed RMA among them. It now issues numbered documents after the
  main demo's, so INV-000001, CN-000001 and RMA-000001 are unchanged.
- **Checks:** `npm run typecheck` on both sides; the server's runs in its
  `verify`, in `verify.sh --quick` and in CI, since its build leaves the
  tests out. Manual checks MC-1501 to MC-1555 cover what tests cannot.
- **Browsers:** every spec in Chromium; `accessibility.spec` in WebKit and
  Firefox; `mobile.spec` on an iPhone. The tab shows `VITE_APP_NAME` from
  `.env` (default `web-app-foundation`); `index.html` asks 360, QQ and
  Sogou for their Chromium engine. Nothing loads from another site, so the
  app works in mainland China; `conventions.md` lists what is supported.
- **Then, on `notifications-language`:** the bell written in the
  reader's current language (each notification's message kept, the
  sentence written on read), ADR-054 amended, migration **0041**; and a
  notification's quantities without padding zeros ("30 of 40", not
  "30.0000 of 40.0000"). Emails are unchanged; old rows show as stored.
- **First, before features: protect the data.** Note the date Render's free
  database expires (30 days after creation, and its data goes with it).
  Turn backups on for real, ADR-053's last step, setup and no code: a
  bucket with versioning and object lock and write-only keys (Backblaze
  B2, or AWS S3 in Canada if residency matters), the `BACKUP_S3_*` and
  `BACKUP_BUCKET` secrets in GitHub, `BACKUP_DESTINATION=s3`, one nightly
  run, one restore drill by hand. If real data is coming within a month
  (Bob's mother's business, a first customer), add the paid database plan
  (ADR-053 phase 2) and the v0.4.0 walkthrough and BF-2609 recall drill
  before any feature.
- **After that:** each with its ADR before code. **Search and lookup**
  (ADR-056) is merged; after any deploy that carries it to a database with
  data, run `npm run backfill:pinyin` once against it, since Render runs
  migrations but not that script (Render's own database: still to do, with the
  External URL and `?sslmode=no-verify`). **Dates, sorting and export**
  (ADR-057) are built on `adr-057-dates-export`, all seven steps: date ranges
  on six lists, a credit notes list, sorts on four with (value, id) cursors
  and migration 0044, ten CSV exports through one writer, audited, the
  screens, and perf probes. **Home** (ADR-058) is merged, all
  five steps: `GET /v1/home` and its cards read through each list's own
  service, the lists opening from the address, Getting started with migration
  0045, the page to the canvas at
  <https://claude.ai/artifact/RqG3iKw4V41is3w1go53EJ>, and its perf probes. Then
  **status pages** (built, below); then **file storage** (one ADR for every
  file, below); then **organization branding** (logo, accent with a contrast
  check, expiry thresholds), the first feature that uploads one. Bob may
  reorder.
- **Recently opened, merged** (PR #61, ADR-058 amended): the
  last records a person opened, on the server per person (migration 0047),
  reported by the eight record pages once loaded, shown on Home under the
  quick actions and in the empty search box.
- **Status pages, merged** (PR #60): one shape for an unknown
  address, a record that does not exist, one the role cannot open, a server
  out of reach and a crash (`client/src/errors/`, conventions.md "Status
  pages"), designed on Home's canvas.
- **Dates, sorting and export, one ADR.** Only the audit log filters by date
  today, and every list is newest first, fixed, because keyset paging
  (ADR-051) relies on one order. Date ranges are cheap, one more filter
  that pages as before: invoices and credit notes by their date, orders by
  expected date, movements and production by date, the accountant's "this
  month". Sorting is not: each sortable column needs its own cursor and an
  index, so only where people ask for it (invoices by amount, orders by
  expected date, inventory by expiry, soonest first). CSV export, raised
  under *Left over*, belongs in the same ADR, since a filtered month is
  what an accountant exports.
- **File storage, one ADR for all of it.** Backups (ADR-053), the
  organization's logo (ADR-055 *Open decisions*) and product images (the
  catalogue note in *Open decisions*) each point at "the bucket question";
  certificates of analysis per lot, licence documents and label versions
  (ADR-029), supplier documents on a purchase and photos on a return will
  too. The ADR settles: provider and buckets (backups never share a bucket
  or keys with anything else); upload checks (type, size, an SVG never
  served as uploaded); files served through the app's own domain, never a
  provider's public URL, which mainland China may block; and how files are
  backed up. Free allowances to start with, terms to check when signing
  up: Cloudflare R2 (no egress fees; check its versioning against ADR-053)
  for files, Backblaze B2 or AWS S3 Canada for backups. A logo of at most
  500 KB could live in the database instead, and needs no bucket.
- **A free development database** past Render's 30 days: Neon and Supabase
  have free Postgres plans; check for Postgres 18 and their sleep and
  expiry rules.
- **Words checked by the reviewer:** 贷项通知单 for a credit note, 开票净额（含税）,
  未开票金额（税前）, 待定成本. The same person could do MC-1405, the fluent review of
  the Chinese catalogue that v0.5 skipped.
- **Issue #54, fixed:** the unsaved-changes guard on Raise an order, and
  the pattern in `conventions.md` for the other long forms. The app now uses
  a data router (`createBrowserRouter`), which `useBlocker` needs.

## Now: v0.5, maintainability and languages

1. **Maintainability, step 1 — done** (the commits after `v0.4.0-rc.1` on
   `main`, one extraction or fix each). What moved where, the behaviour
   settled on the way, and the test gaps found are in the section below.
2. **Maintainability, rounds 2 and 3 — done** (PR #36, merged; tagged
   `v0.5.0-alpha.1`): the section after step 1's. What is left is listed
   at its end; none of it is half-done.
3. **ADR-050, licence status at release** — built, merged (PR #39) and
   deployed: migration 0037; release checks the recipe's licence
   against the organization's policy (Settings → Organization → Licences at
   release); an expired or not-yet-in-force licence can be overridden with a
   reason by whoever holds `production.override_licence` (Owner-only); the
   run records the state, the overrider and the reason, shown on the run
   page and in the lot trace. Manual checks MC-506 and MC-508 to MC-511.
4. **ADR-051, performance testing** — built and merged (PR #38), tagged
   `v0.5.0-rc.1`: `seed:volume`, `npm run perf`, `npm run perf:plans`, the
   Performance workflow, and the fixes the first runs asked for. Results,
   what to watch and the production items, each with a trigger, are in
   ADR-051's **Results**.
5. **ADR-052, calendar days as `date` (#20)** — built and merged (PR #40):
   migration 0038; lot expiry, an
   order's expected date and a licence's dates are `date`, sent and
   returned as `YYYY-MM-DD`. `CALENDAR_DAY_INPUT` (strict by default, or
   lenient) decides whether an instant at UTC midnight is still accepted.
   `todayUtc()` (`server/src/common/today.ts`) is the server's one "today":
   licence status at release and the receipt rate lookup ask it.
   `utcMidnight` is gone from the client; MC-R04 is its manual check.
6. **ADR-053, backups** — phases 0 and 1 done. Phase 0 by hand: Render is
   on the Free plan (no backups, expires after 30 days), one manual
   encrypted dump restored locally with both organizations back. Phase 1
   merged: `scripts/backup.sh`, `restore.sh`,
   `backup-latest.sh`; `.github/workflows/backup.yml` (10:00 UTC, plus a
   26-hour freshness check) and `restore-drill.yml` (the 1st); the runbook
   `docs/runbooks/restore.md`; MC-1301 to MC-1304. **Live since 7 October
   2026:** `BACKUP_DESTINATION=s3` to Cloudflare R2, bucket `waf-backups`
   (ADR-053 amended: Eastern North America hint, a 30-day bucket lock on
   `production/`, lifecycle daily 31 days and monthly 366, a read-and-write
   key for the job and a read-only one for the drill). The first backup was
   220 KB; the first drill restored 2 organizations and 42 migrations. A
   paid database plan still comes before real customers' data.
7. **ADR-054, languages** — built on `adr-054-languages`, tested, and
   ready to merge. `en`, `fr-CA` and
   `zh-Hans`, all seven steps of the ADR:
   - **The person's language** (`users.locale`, null meaning the browser's),
     chosen on the account page; FormatJS on the client, every screen in
     all three (1193 messages, `client/src/locales/`), English compiled in
     and the others loaded on demand. A no-literal lint rule covers all of
     `src/**/*.tsx`.
   - **Document languages**: one or two (French with English, Chinese
     alone), the partner's pair else the organization's, stored on the
     shipment, invoice and credit note. The packing slip, invoice and
     credit note print in them (`useDocumentText`), whatever the reader
     reads; item names in both on the invoice and credit note, copied at
     issue; the packing slip prints the products' own names. Product and
     variant names in other languages (`product_translations`,
     `variant_translations`); the organization chooses which are required,
     checked at issue.
   - **The server answers in the request's language**: services throw
     `t({ id, defaultMessage }, values)`, AllExceptionsFilter renders it by
     Accept-Language, which `api()` sets to the chosen language; English
     unchanged word for word without the header. Validation messages
     (TranslatingValidationPipe), emails and notifications (in the
     recipient's language, `recipientLocale`), and the audit log's action
     names too. 323 messages in `server/src/i18n/`. Two developer errors
     stay English on purpose.
   - **Checks**: `npm run i18n:check` on both sides in CI, with
     `check-client-locales.js` and `check-client-audit-actions.js` keeping
     the two packages' lists in step. `e2e/languages.spec.ts` runs the
     whole path in a browser; MC-1405 to MC-1414 are the manual checks.
   - **Demo and volume**: `seed:demo` has a French-and-English and a
     Chinese customer with an invoice each; `seed:volume` has customers in
     both and products named in them.

   **Tested before merging (6 October 2026):** 659 server e2e tests, 64
   server unit tests, 175 client unit tests, 65 Playwright tests including
   `e2e/languages.spec.ts`, and ADR-051's budgets re-run on the new
   `seed:volume` (recorded in ADR-051's Results; issuing 25 ms p95).

   **Decided, not forgotten:**
   - **The fluent review (MC-1405, step 4) is skipped for now.** No one
     fluent in French or Chinese is available, so both are unreviewed
     drafts, written alongside the code against `docs/glossary.md`. When a
     reviewer is available: `node scripts/i18n-review.mjs export` writes
     `review/fr-CA.xlsx` and `review/zh-Hans.xlsx`, they fill in the
     Correction column, `import` writes it back, one commit. Until then the
     language picker marks both, "Français (Canada) — bêta" and
     "简体中文（测试版）" (`UNREVIEWED_MARK` in `client/src/lib/locales.ts`;
     delete a language's entry once its review is imported), and release
     notes say so.
   - **The v0.4 end-of-milestone walkthrough was skipped**, and v0.4.0
     never tagged; the next tag (v0.5.0, covering ADR-052 to ADR-054)
     says so in its notes.

   Known edges, written down rather than fixed: the packing slip has no
   item names in other languages; field names inside an audit entry and
   in validation messages are the API's; the industry vocabulary
   ("recipe", "batch") is an open decision in `decisions.md`.

## What v0.4 built

**ADR-046 — invoicing.**

- An invoice bills exactly one shipment; draft → issued → voided.
- Issuing takes a gapless per-organization number (`document_sequences`,
  `INV-`/`CN-`/`RMA-`), stores every amount, and copies seller, bill-to and
  ship-to.
- Amounts are one SQL calculation (`invoice-amounts.ts`) shared by preview
  and issue. Nets are rounded to the currency's minor units; tax per
  component is rounded once per invoice.
- A sale must be priced and single-currency at confirm. Samples are never
  invoiced.
- Void issues a full credit note.

**ADR-047 — RMAs and credit notes.**

- An RMA has a resolution per line (credit / replace / none).
- A credit note credits part of one invoice. It is capped by value, by tax
  component, and by RMA quantity.
- Replacement is a draft sale at zero.

**ADR-048 — cost: value is a ledger, like quantity.**

- `stock_valuations` is append-only. Kinds: `movement`, `run_close`,
  `correction`, `issued`, `opening`. `issued` is value belonging to units
  already gone, kept out of the pool's balance.
- `valuation_pools` is the cache and lock, per lot or per untracked variant.
- The method is weighted average within a pool, so lot-tracked stock carries
  its actual cost per batch.
- How value arrives:
  - A receipt copies its line's price × the latest rate on or before the
      server's today, the UTC day (`todayUtc`, ADR-052).
  - Run close posts the batch's material cost to its output.
  - A correction (`PUT /v1/costs/valuations/:id`) splits the difference
      between stock held and stock gone.
  - `needs_cost` is cleared by a later row, never edited.
- `organizations.base_currency`, fixed once anything carries a value.
- `exchange_rates`: one per currency per day.
- `costs.view` and `costs.update`, Owner-only.
- Screens:
  - Stock value and its needs-cost list;
  - exchange rates;
  - cost panels on runs and lot traces.

**ADR-049 — price lists: a default the line keeps.**

- A list has one currency and one direction (sale / purchase).
- A partner names a sale list and a purchase list; the organization names a
  default sale list.
- A line added without a price copies its list's price, and records
  `price_source` and `price_list_id`. Nothing reads the list again.
- A sample never takes a list price. A currency clash leaves the line
  unpriced, with a notice. A duplicate keeps its source's prices.
- "Use list price" (`POST …/lines/:lineId/list-price`) is the explicit
  refresh.
- `price_lists.view`, `.create` and `.update`, Owner-only.
- Open decisions: quantity breaks and dated prices. Both would arrive as new
  columns with defaults.

**Test harness (#1, closed).**

- `createTestApp` listens once on 127.0.0.1. Supertest's per-request
  ephemeral port could be answered by another process on macOS.
- Each e2e run takes an advisory lock on the test database, so a second run
  refuses to start instead of truncating the first one's tables.
- `server/scripts/e2e-flake-hunt.sh N [suite]` reruns and summarises
  failures.

**Dependencies.** Minor and patch updates were taken directly with
`npm update`. The client is on msw 3: `onUnhandledFrame: 'error'` in
`src/test/setup.ts`.

## Maintainability, step 1 — done

Found with jscpd, fixed in the plan's order: shared client code, shared
server code, test helpers, then the largest files. Code-only clones went
from 186 to 92 (tsx) and 312 to 261 (typescript); what is left is mostly
kept on purpose (schema column declarations, create/update DTO pairs,
repeats inside one spec) or form plumbing. `.jscpd.json` holds the paths and
ignores the migration snapshots, so a plain `npx jscpd` gives the report.

**Reviewed and kept — jscpd still reports these; each was read and left on
purpose.** Do not re-review them unless the code around them changes:

- Create and update DTO pairs (address, contact, partner, variant, licence,
  location): required against optional; each DTO states its own shape.
- Controller import headers and schema column blocks: declarations, not
  rules.
- The e2e specs' own response interfaces against the generated types:
  separate packages, and the specs describe what a test reads, not the
  whole response.
- Login, register and reset: their form-state and submit blocks skip
  `useSubmit` because they navigate away on success. Forgot-password keeps
  its own message: it must not repeat the server's words.
- The login and forgot-password email field, the two order-line price
  fields, and the "Into" location select in the receive dialogs: two
  copies each, with different help text.
- List pages' loading and empty frames: they vary in skeleton rows and
  wording; a component would need a prop for each difference.
- Dialog plumbing (imports, `useSubmit`, `close`, `handleSubmit`, the
  `update(field)` helper): sharing it would mean a form framework.
- `products/variant-row.tsx` keeps its own `Detail` (label beside value, a
  spec sheet); `LabelledValue` is caption above value.
- The cost panels' top (the `useResource` guard and a six-line heading) and
  the run cost panel's two tables (different columns).
- The packing slip's lot table: `LotItemsTable` links each lot, and on
  paper a link only prints as an underline.
- Stock value's needs-cost list stays off `useKeysetList`: it is read with
  the valuation under one banner. The multi-read pages (order detail,
  members, inventory, exchange rates) stay off `useResource` for the same
  reason.
- Two order lookups stay outside `loadOrder`: one joins the partner for its
  columns, one runs outside a transaction through `TenantDb`.
- Repeats inside a single spec: each test should read on its own.
- `stock.e2e-spec.ts` keeps its own `createLocation` (its own defaults; the
  name also clashes with the fixture).
- `lockOpen` against `lockForReceipt`, and `lockDraft` against void's lock:
  the same lock query, different rules. A path id answers 404, a body id
  400; the allowed statuses differ; the receipt adds order and goods
  checks.
- Ship's and receive's counter updates on the order line: two limits and
  two constraints (ordered against shipped). Each says so in a comment.
- Closing and reopening a line: the same "confirmed only" skeleton, each
  with its own message.
- The order list against order detail, and the two invoice-line reads in
  issuing and in `InvoicesService`: different columns.
- `users.e2e-spec.ts` keeps its own `addMember` (it returns more than an
  agent).
- `boms/boms.service.ts` stays one service: a separate lines service would
  first need `insertLines`, `assertNoCycle`, `assertDraft` and `loadWithin`
  shared across two files. Revisit if it gains a second job, such as
  costing a recipe.
- The recipe panel's version header stays in the panel (about eight props
  and handlers to pull it out).

The layout stays feature-first. Do not regroup into `pages/`, `components/`,
`utils/` by type; `components/` holds only what two or more features share.

## Maintainability, rounds 2 and 3 — done

On PR `v0.5-round-2`, one extraction or fix per commit. Most of it was
written from the repo without running anything. Bob ran every suite
locally after round 3, all green, and `lint --fix` applied Prettier where
code had been formatted by hand.

- **Round 2.** The returns/shipments pairs: the lock order became
  `inVariantOrder` (production's release uses it too) and what a document
  moved became `lot-items.ts`; the counter updates stayed apart, with a
  comment. Shipments, RMAs and stock split into the services listed under
  shared pieces. Test gaps: every shared lookup has a cross-tenant test;
  `minorUnits` and `inVariantOrder` have unit tests (the rest of those
  files runs in SQL, covered by e2e). Whether an expired licence stops a
  release became ADR-050.
- **Round 3, from jscpd.** Fixes first, then extractions: the Owner rules
  in `users.service.ts`, a draft BOM's line, a location that can take
  children, a partner's default address and primary contact, TenantDb's
  ordering and limit; then the decimal and calendar-day decorators; then
  `roleIdNamed`, `addMember` and `addViewer` into the fixtures.

**Size review (the four largest files left, judged by jobs, not lines):**

- `orders/orders.service.ts` (700): split. `OrdersService` keeps the reads;
  `OrderLifecycleService` has create, duplicate and update.
- `invoices/credit-notes.service.ts` (599): one job, kept; its 360-line
  calculation moved to `credit-amounts.ts` (`computeCredit`, beside
  `invoice-amounts.ts`) and reads as three steps.
- `client/src/boms/recipe-panel.tsx` (601, now 480): `useRecipe()` reads a
  variant's recipe in one place and `RecipeLinesTable` is the lines table.
  The rest is the selected version's header; a component for it would take
  about eight props and handlers, more wiring than it saves, so it stays.
- `boms/boms.service.ts` (587): one job in about twenty short methods,
  kept (see reviewed and kept).

**Behaviour settled in rounds 2 and 3 (fix commits):**

- A request against the wrong kind of order is a 400 everywhere: an RMA or
  an invoice draft from a purchase used to be 409. An order's direction
  never changes, so the request can never succeed.
- A line sent twice is refused by the DTO (`@ArrayUnique`) on ship, return,
  RMA and credit, so it is a 400 before the document's state is read.
- A sale is in one currency from its first priced line, on a draft too,
  however the price arrives (ADR-046 amendment). A conflicting list price
  on an added line is still left off rather than refused (ADR-049).
  Purchases keep a currency per line (ADR-035).
- The recipe panel's reload after an action drops an answer that arrives
  after a variant switch, as the switch itself already did.
- Message wording only: non-negative prices say "zero or more"; every
  calendar day says "must be a calendar day, YYYY-MM-DD" and, for a day
  that does not exist, "must be a real date".

**Left from these rounds, none started:**

- Two fixes without a test: the recipe panel's reload answering late
  (its tests would need a response held back) and invoice drafting's
  refusal of a purchase shipment (no route can make one).
- Test setups jscpd still reports across specs: costs against valuation,
  returns against shipments, and the bootstrap blocks every spec repeats.
- Not read yet: the organization address DTO against the partner address
  DTOs (possibly one address rule); on the client, the lot-picking blocks
  shared by the ship, return and release dialogs, a third copy of the price
  fields in the invoice-line dialog, and the lines table on credit-note and
  invoice detail.

**Shared pieces — use these rather than writing the thing again:**

- Client `lib/`: `messageFor` and `ApiError` (reads `Retry-After`) in
  `api.ts`; `useResource` (one GET with reload); `useKeysetList` (paged
  lists); `formatDay` in `format.ts`; the `CalendarDay` type in `types.ts`.
- Client `components/`: `DialogFooter`, `LabelledValue`, `CurrencyField`,
  `SettingsSection`, `LoadMoreButton`, `AddressFields`, `PdfActions`.
- Server `core/documents/`: `sheet.ts` (`masthead`, `party`, `linesTable`,
  `totals`, `banner`, `notice`) for every document's parts, `parties.ts`
  for who and where it names, and `DocumentsService.send` with a
  `Printable` for its route.
- Client, per feature: `boms/use-recipe.ts`, `boms/recipe-lines-table.tsx`,
  `inventory/lot-fields.tsx`, `auth/auth-message.ts`,
  `orders/status.ts`, `orders/order-lines-section.tsx`,
  `orders/order-status-actions.tsx`; test factory `test/factories.ts`.
- Server `common/`: `dto/currency.ts` (`IsCurrencyCode`, with
  `isCurrencyCode` in `database/schema/columns.ts` for checks),
  `dto/decimal.ts` (`IsPositiveDecimal`, `IsNonNegativeDecimal`),
  `dto/calendar-day.ts` (`IsCalendarDay`, which reads `CALENDAR_DAY_INPUT`),
  `today.ts` (`todayUtc`), `dto/keyset-query.dto.ts` and `keyset.ts`
  (`pageOf`). A DTO never restates a rule's message; `$property`
  names the field.
- Server lookups every action starts from, each scoped to the organization
  in its where clause: `orders/load-order.ts`, `invoices/lock-draft.ts`,
  `production-orders/run-guards.ts`, `return-authorizations/lock-open.ts`.
  Also `stock/rates.ts` (`baseCurrency`, `rateOnOrBefore`),
  `stock/availability.ts` (`inVariantOrder`, the one order product locks
  are taken in), `orders/order-line-pricing.ts` (`pricedCurrencies`,
  `assertOneSaleCurrency`), `orders/lot-items.ts` (what a shipment or
  return moved), `return-authorizations/lines-with-progress.ts`,
  `invoices/issued-invoice.ts` (`partiesOf`, `stored`),
  `invoices/credit-amounts.ts` (`computeCredit`).
- Server services split by job, like shipments and returns already were:
  orders → `OrdersService` (reads), `OrderLifecycleService`,
  `OrderLinesService`, `OrderReceiptsService`;
  invoices → `InvoicesService` (reads), `InvoiceDraftsService`,
  `InvoiceIssuingService`; production → `ProductionOrdersService`,
  `ProductionExecutionService`, `ProductionCloseService`; shipments →
  `ShipmentsService` (reads), `ShippingService`, `ShipmentVoidsService`;
  RMAs → `ReturnAuthorizationsService`, `ReturnAuthorizationReceiptsService`
  (the only one exported), `ReturnAuthorizationReplacementsService`; stock →
  `StockService` (the one write path, kept whole), `StockReadsService`,
  `LotsService`.
- Server tests `test/utils/`: `fixtures.ts` (`createE2eApp`, `body`,
  `PASSWORD`, `registerOrganization`, `createPartner`, `createLocation`,
  `createVariant`, `roleIdNamed`, `addMember`, `addViewer`), `sales.ts`
  (`shippedSale`), `valuation.ts` (buy, move, pool reads,
  `expectBooksToReconcile`), `routes.ts` (the coverage walk).

**Behaviour settled on the way (fix commits, not refactors):**

- A failed reload shows its error; it used to escape as an unhandled
  rejection.
- A rate limit says how long to wait: `api()` reads `Retry-After`.
- A dialog cannot be closed while it saves — not Cancel, Escape or the
  backdrop (`onClose={submitting ? undefined : close}`).
- A calendar day is a `date` column, sent and returned as `YYYY-MM-DD`,
  and a form sends the date input's value as typed (ADR-052, #20).
- Paged lists: a successful read clears the error, a page answering after
  the filter changed is dropped, the cursor is URL-encoded, and Load more
  sits centred under the list.
- `issue()`'s tax-code subquery is aliased plain SQL (the handoff item). The
  installed Drizzle already rendered it qualified; it no longer depends on
  that.

**Test gaps found while refactoring** (step 1; rounds 2 and 3 closed the
first three):

- ~~Server unit tests for the pure logic~~ — done where it is pure.
- ~~Cross-tenant tests per shared lookup~~ — done.
- ~~Whether an expired licence stops a release~~ — it does not; ADR-050.
- ~~No performance tests~~ — ADR-051.
- Still open: no end-to-end journey (buy → receive → make → ship → invoice
  → credit) in Playwright.

**In flight — finish before new work:**

1. **Turn the backups on.** Render's database Access Control allows all
   IPs (Actions runners change address every run). Add the secrets
   `BACKUP_DATABASE_URL`, `BACKUP_AGE_RECIPIENT`, `BACKUP_AGE_IDENTITY`
   (`gh secret set`, runbook section 1). Run **Backup**, then **Restore
   drill**, by hand: both green, the drill's summary showing the
   organizations and the time.
2. Walk MC-1301 to MC-1304. Backups phase 1 is then done.
3. **Close out #20** (closed on merging PR #40): the Render deploy log
   shows migration 0038 applied; walk MC-R04 on the Render site.
4. Open the issue "Organization time zone for today" (ADR-052, Deferred).

**Next, in this order:**

1. **ADR-054, languages** — written; build it in the ADR's order,
   starting with step 1 (server, migration 0039). Before the release that
   offers French or Chinese: a fluent review of each catalogue, and the
   advisor's answer on which pair a Quebec customer needs and whether its
   invoices must describe items in French.
2. **The Playwright journey**, written with Bob at a computer: one browser
   test that buys from a supplier, receives into a lot, makes a batch,
   ships to a customer, invoices and credits a return — the parts working
   together, which no single test proves.

**Before real customers** (not needed while the database is the Free
test instance):

- Backups phase 2: a paid database plan with point-in-time recovery, and
  the S3 bucket in Canada with object lock (`BACKUP_DESTINATION=s3`, the
  runbook's section 1). Settings, not code.
- The security review in *Open decisions*: two-factor sign-in, dependency
  scanning on every PR, secret rotation, encryption at rest.
- The Free database's expiry date. When it comes, recreating it and
  restoring the newest backup is a real test of the runbook.

Rules, still in force:

- no behaviour change in a refactor; a fix is its own commit, first;
- tests stay green between commits;
- one extraction per commit, with the reason in the message;
- a duplicate that differs on purpose stays, with a comment saying why. The
  goal is one definition per rule, not the fewest lines.

**The account e2e tests** no longer fail locally: all four passed five
times running on 9 October. Repeating the two password tests within a
minute (`--repeat-each`) gets 429s from the auth rate limit, five attempts
a minute (ADR-011), which is the limit doing its job; repeat only the
display-name test, or wait a minute between runs.

## Open GitHub issues

Listed in the Now section, under "Still to do, by hand"; `gh issue list`
for the current state. Where #18, site licences, is heading is sketched
in ADR-050's amendment.

## Left over, small

- **Pro forma invoices** — deferred in ADR-046; remind Bob. Bring forward if
  the business needs them for customs, prepayment or sample values.
- Check ADR-047's audit list names `return_authorization.replacement_raised`.
- ADR-051 tooling: both follow-ups are done in ADR-081 (`perf/` was
  type-checked by `npm run typecheck` since 7 October; a manifest per
  scale). Watch: `seed:volume`'s Owners are registered but never
  confirmed, which matters only if perf ever times an invitation
  (ADR-077 refuses an unconfirmed inviter).
- `docs/manual-checks.md` coverage pass: map every ADR and every client page
  to at least one check. The list covers the main flows, round 2 and
  licences at release (MC-506, MC-508 to MC-511), not yet tax codes and
  the rest of organization settings, closing a line short,
  cancelling or re-raising a run, the price-list screens, printed documents
  other than the invoice, session timeout, dark mode or narrow screens.
- Production performance (ADR-051, **Results**): turn on
  `pg_stat_statements` from the first day of real use. Compression is
  already done by Render's edge (Brotli). The rest wait for their
  triggers.
- CSV import: raised, not decided; export is ADR-057. Import and bulk
  insert need an ADR first (validation, partial failure, audit,
  duplicates, tenant checks). Decide from what users actually need.
- ADR-048 deferrals worth remembering:
  - propagating corrections through closed runs;
  - period close;
  - landed cost and conversion cost;
  - FIFO;
  - export to the books;
  - confirming the weighted-average method with the accountant.
- User guides and a glossary: raised, not decided. Markdown under
  `docs/user/`, a getting-started order, task guides by job, the rules in
  plain words, and a glossary that also holds the translation terms (ADR-054).
  Screenshots for them come from `npm run screenshots`.
- Client speed: unmeasured. Lighthouse on the Render static site, warm and
  just woken, and the bundle sizes `vite build` prints; measure first and set
  a budget only if something is slow, as ADR-051 did for the server.
- Every workflow runs on `ubuntu-24.04`, pinned, so `ubuntu-latest` moving
  to Ubuntu 26 on 19 October 2026 changes nothing. Moving is a choice: one
  line per job, CI as the test.
- From the UI pass (ADR-055), small:
  - **Firefox on Bob's Mac:** Playwright's build cannot open its profile
      there ("Could not find profile folder"; reinstalling, clearing
      quarantine and moving TMPDIR did not help). CI runs it on Linux, and
      `E2E_FIREFOX=1` runs it locally. Not a work item: retry after a
      Playwright update, or from Terminal rather than WebStorm.
  - **Page titles per screen:** the tab reads the product's name
      everywhere; "SO-DEMO-1 · web-app-foundation" helps with several open.
  - **The "after" screenshots** for the UI pass, kept with its release,
      and a release tag for it and the notifications work (`v0.6.0-rc.1`?).
  - **Full workflows in WebKit and Firefox:** only specs that make their
      own organization or change nothing run in more than one browser.
      Each spec on its own organization would let all of them; worth it if
      a Safari user hits a workflow bug.
  - **A notification's decimal point:** quantities lose their padding
      zeros but keep "." in French ("1.5", not "1,5"); a notification is
      written before anyone reads it. Fix by formatting the value when the
      sentence is written on read, if a reader minds.
  - `.github/workflows/ci.yml` is outside every `format:check` and not
      Prettier-formatted; harmless.
- Before customers, by hand rather than code:
  - **Real devices:** Android with WeChat (its engine is Tencent's, and
      nothing automated covers it), and 360 or QQ on Windows in 极速模式.
  - **One email to a QQ or 163.com address:** verification and reset
      mail can be delayed or filtered there.
  - **Serving China:** a Hong Kong or Singapore region with our own
      domain; hosting inside mainland China needs an ICP filing.

## Working agreements (for Claude)

### Pull requests

- **One PR per feature** (October 2026): its ADR, when it has a new one,
  as the first commit, then server, client and docs as commits of their own;
  fixes go on the branch until its checks pass, never in a follow-up PR.
  Small chores (a CI line, a lint rule, a docs tidy) ride along in the next
  feature PR rather than getting one of their own.
- **The reviews, before the PR is opened** (21 October 2026, and from
  ADR-081 four): every feature branch runs, for any PR that changes what
  a person sees, `/usability-walkthrough` as one of its personas
  (`.claude/skills/usability-walkthrough/personas.md`), then `/simplify`,
  then `/code-review`, so the review sees every fix before it, then
  `/production-readiness` on the sections the change touches
  (conventions.md, "Production readiness"). Each
  fix they lead to is its own commit. The PR description names the journey
  walked and the persona who walked it. `/usability-walkthrough` was
  missed on several recent PRs, so this branch's step 7 (ADR-079) walks
  two journeys, to make up for ADR-077 and ADR-078.

### How code is delivered

- **Dependencies, on every branch** (21 October 2026): `npm outdated` in
  `server/` and `client/`, taking the in-range updates as a commit of their
  own at the branch's start, and again before the reviews. From ADR-081,
  only versions at least 7 days old (`npm update --before=…`), a security
  fix excepted (conventions.md, "Dependencies").
- **Planned in this chat, built in Claude Code** (from ADR-079, 20
  October 2026). The claude.ai chat does the check before an ADR (its
  Deferred lines, the watch lists, Open decisions and the open issues),
  the decisions for Bob to confirm, the ADR as the branch's first commit
  (it tidies the handoff too), the canvas designs, and a build brief: one
  Claude Code prompt per commit. Claude Code writes the code from each prompt, runs
  `scripts/verify.sh`, `/simplify` and `/code-review`, and opens the PR.
  Bob pastes its summaries back into the chat, which writes the as-built
  amendment and the docs, as full files. Until ADR-078 the chat wrote
  the code too, as one mbox per commit, and Claude Code only applied
  them.
- **The build, as ADR-079 ran it.** The brief and the canvas's boards go
  in `tmp/adr-NNN/`, ignored by git though `scripts/verify.sh` lints its
  Markdown. Each prompt is one line: "Read tmp/adr-NNN/brief.md and do
  step N. End with the summary for the chat." `/clear` between steps,
  never inside one; a step's follow-ups (an amend, an issue to file) stay
  in its context, and its summary is pasted into the chat before clearing.
  The review step runs in two prompts: the reviews and walkthroughs,
  stopping for Bob's choices, then the fixes, the full verify, the push
  and the PR.
- **Cloud sessions** (Claude Code on the web, from October 2026): one new
  session per task, from `main`, each cloning the repository fresh, so
  nothing is pulled first; a long session pays for its whole history at
  every step. The prompt names the issue, the branch, the author Zhenzhong
  Zhou with the session as committer (the commit then shows Verified), the
  regression check's number when several run at once, and the files to
  leave alone; asks for `scripts/verify.sh --quick`, a pull request with
  "Fixes #N" and a last line saying DONE or BLOCKED; and ends with the stop
  rule: change only what the issue names, and past about 20 minutes or
  more files than that, stop and report. A proof runs only the changed
  tests; a sweep, a load proof or anything needing the large seed stays on
  the Mac. PRs merge one at a time, each when green; a branch behind
  `main` with no conflict merges as it is, and a conflict in
  `docs/manual-checks.md` is settled on GitHub with "Accept both changes",
  an empty line between Regressions entries.
- **Every pull request** that changes what a person sees takes pictures
  before and after and compares them (`npm run screenshots:compare`), and
  its Claude Code Review comment is read before merging. The README's
  "Which tool, when" says when each of the repo's tools runs.
- **The chat's docs commits come as full files, not an mbox** (from
  ADR-082, 24 October 2026): `git am` had failed on Bob's side. Each file
  is made from `main` as Bob has it, with its `git hash-object` before
  and after, so a copy made from another version is caught before it
  overwrites anything; then the commands to copy it in and commit.
  Downloads land in `~/Downloads` itself, not a folder, so each file is
  named in full, never a glob.
- **Every answer that changes files opens with a roadmap:** a tree or
  relative paths, each marked **new**, **full replacement** or **snippet**.
- **New files, and changes touching several places or a large chunk of one
  file, come as full downloadable files.** Only a single small change stays
  inline as a snippet.
- Full replacements are made from Bob's current copy. Project knowledge
  counts once Bob says he has resynced from `main`. Otherwise ask, or build
  from the Project copy plus known changes and tell Bob to check `git diff`.
- State the exact path of every file:
  - `server/src/modules/…`;
  - `server/src/core/…` (organizations, audit, authorization);
  - `server/src/database/schema/…` and `…/migrations/…`;
  - `server/test/…`;
  - `client/src/…` (feature folders, `lib/api-names.ts`, `auth/permissions.ts`);
  - `client/e2e/…`;
  - `docs/decisions.md`.

### Process

- ADR before code for each new area. Server first with e2e tests, then the
  client screens. Each step its own commit.
- **At the start of every ADR,** before drafting it: check `decisions.md`'s
  Deferred lines, this handoff's watch lists and the open issues for
  anything in the same area, and say which triggers have fired. That is
  when a deferred item is cheapest to pick up.
- **The seeds grow with every feature** (from ADR-081): `seed:demo`, so
  its screens, manual checks and walkthroughs need no setup; `seed:volume`,
  realistic rows for any new table or hot query, timed against ADR-051's
  budgets. Every build brief has a step for both, or says why a feature
  adds nothing (CLAUDE.md; conventions.md, "Seeds").
- **A change that touches many screens** starts its build with an
  inventory step: Claude Code lists every cross-area read and link (or,
  for ADR-081, every chunk, request and failure path) before building.
- Migrations:
    1. write the schema;
    2. run `npm run migrate:new -- --name <name>`;
    3. append the hand-written parts (triggers, backfills) after a
       `--> statement-breakpoint`;
    4. run `npm run migrate:all`.

  Check the generated SQL keeps `NULLS NOT DISTINCT`. Check the new
  entry's `when` in `meta/_journal.json` is later than the one before:
  the migrator skips a migration whose time is earlier than the last one
  applied, and still reports success. 0065's was ahead of the clock, so
  0066 was generated earlier and skipped, with no column and no error,
  until its time was moved after 0065's.
- **At each release,** before tagging it, set both packages' version to
  it: `npm version <x.y.z> --no-git-tag-version` in `server/` and in
  `client/`.
- A type change on the client means fixing the test fixtures that build that
  type, in the same commit. Vitest does not type-check; `tsc` and CI do.
- A commit that changes what a person sees, or a rule they work under,
  updates `docs/manual-checks.md` in the same commit (`docs/conventions.md`,
  Tests).

### Commits

- **Authored as Bob:** `Zhenzhong Zhou <bob0823.zhou@gmail.com>`, the
  identity on the repo's history (`git log --format='%an <%ae>' | sort |
  uniq -c` shows it). Every mbox or patch Claude prepares uses it, never a
  placeholder such as `Claude (draft) <draft@example.invalid>`: removing
  those took a history rewrite. A pre-push hook refuses a push that
  carries one: `.git/hooks/pre-push` until ADR-082 moves it to
  `scripts/hooks/`, with a CI check behind it.
- Explicit `git add` per concern, never `-A`.
- Run `git status` before every commit. Files staged earlier — even new or
  empty ones — ride into whichever commit runs first. Unstage with
  `git restore --staged <path>`.
- Each commit must build on its own. When a fix is already broken on `main`,
  it goes first.
- Messages explain the why, as one `-m` with a subject, a blank line and
  wrapped paragraphs.
- To reorder unpushed commits: `git reset --soft <base>`, restage per commit,
  and `git commit -C <old-hash>` to reuse each message.
- Before pushing, run what CI runs: `scripts/verify.sh` from the repo
  root (both sides, CI's order, stops at the first failure; `--quick`
  skips the end-to-end suites). Editor auto-imports in the wrong quote
  style fail CI.
  (`npx tsc --noEmit` in `client/` checks nothing: the root tsconfig only
  holds project references.)

### Moving code (what step 1 learned)

- Find every caller before moving a method, including
  `server/src/database/seed-demo.ts`, and calls split over two lines
  (`this.taxCodes` then `.findById`). CI runs `npm run seed:demo` on a
  fresh database, but only once the change is pushed, so after a server
  move run it locally too.
- Prove a move lost nothing: every non-import line of the old file should
  appear, as often, across the new ones.
- Check a new comment's claims against the code it describes before
  keeping it.

### Server

- Server e2e: always `npm run test:e2e`. Never run two at once — the second
  now refuses. Don't edit server files while Playwright runs against
  `start:dev`.
- **`npm run api` is the truth about the document.** An enum written from
  a TypeScript union can change order when the code around it changes,
  since TypeScript orders a union by when it first meets each member.
  Commit what it writes; never put an older order back by hand.
- **Time zones by name, through one function on each side** (ADR-072):
  `todayIn` and `dayIn`, never `AT TIME ZONE` in SQL. Node and Chromium
  spell some zones the old way (`Asia/Calcutta`) and Safari the new;
  both sides map the old to the current.
- **Drizzle writes a column without its table name when a query has no
  joins.** Inside a correlated subquery, name the outer row in plain SQL.
  Raw SQL with every table aliased avoids it.
- Quantities and money stay strings end to end (ADR-025); compare and sum in
  SQL; the client never does decimal arithmetic. Values round to six places.
- Refusals in order: malformed (400), not found (404), not allowed (409), all
  before any write. Ids from a body that belong to another tenant are 400.
- Every write route is audited or listed in `NOT_AUDITED` with a reason.
  Every route has `@RequirePermissions`. Never seed a permission nothing
  gates. New permissions default to Owner-only: add them to `PERMISSIONS`
  and its descriptions, never to the Admin or Viewer lists, and to the
  client's list in the same commit.

### Client and copy

- Dialogs take permission flags from their page rather than reading the
  session.
- `useSubmit`'s callback takes no result — keep ids and notices in a
  `useRef`.
- Hooks never inside hooks or after an early return.
- Playwright:
  - prefer `getByRole(…, { name, exact: true })`, and label tables
      (`aria-label`) so row lookups stay inside them;
  - an accessible name includes everything in the element, such as
      `Old retail (CAD) — retired`.
- British spelling in comments and copy is intentional.

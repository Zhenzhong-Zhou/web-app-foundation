---
status: accepted
date: 2026-10-24
amends: [ADR-019, ADR-051, ADR-055, ADR-060, ADR-067, ADR-081]
amended-by: [ADR-083]
---

# ADR-082 — The product's brand: Panivo before sign-in, the organization's after (amends ADR-019, ADR-051, ADR-055, ADR-060 and ADR-081)

> **Amended by [ADR-083](0083-the-emails.md).**
> The product's emails share one layout with the invitation, built from blocks; the header is that layout's first block, and an email's main action is a button where it already has words.

**Context.** The product was named Panivo, 品桥 in Chinese, in October
2026, and #201 gave the tab its icon and every tab the name
`VITE_APP_NAME` sets. Nothing else says whose app it is. The sign-in and
register pages show a form with no name above it; the rail ends with
nothing under an organization's logo; Help's foot names a version and
no product; an email is signed by `MAIL_FROM`'s name and shows no mark;
and a phone's home screen takes the name of whichever page it was added
from. ADR-060 drew the line between the two: the tab icon and the
sign-in page come before anyone signs in, so they stay the product's
own, and after sign-in the theme, the logo and the documents are the
organization's. This ADR fills in the product's side of that line.

Checked before drafting, as the working agreements ask:

- **Fired, and taken here.** The handoff's "Still to do, in code", the
  brand's next PR, item by item. From #201's `/production-readiness`:
  the ICO holds the light mark only, so its navy stem is about 1:1 on a
  dark Windows taskbar or Safari 16.4 to 18's dark tab bar; and with no
  web manifest, which icon Android's Add to home screen takes is
  uncertain. ADR-060's "the sign-in page stays the product's", which no
  screen had acted on yet.
- **Not fired, and kept in step.** ADR-060's white-labelled domain, tab
  icon and sign-in page: no customer sells the product under their own
  name, and the names below are settings, so a deployment can be renamed
  without code. ADR-060's second logo for dark backgrounds is about an
  organization's logo; the product's mark has its own master for dark.
  ADR-037 keeps the security emails the product's, which this does.
  ADR-077 names an organization in an invitation in words, never by its
  logo, since mail apps block images, and an invitation stays so. #142,
  the client's Content-Security-Policy: a manifest will want
  `manifest-src 'self'`, and nothing below loads from another site. #212
  (Help's Esc before its guide loads): the line below sits in the same
  panel's foot and leaves its keyboard alone.
- **Found while checking.**
  - ADR-055's default accent `#5546B8` and the dark rail `#1C2230` are
    the mark's own bowl and stem (`docs/brand/README.md`), so the
    brand's colours ask nothing of the theme.
  - Help's foot already carries ADR-081's version line.
  - Emails are built one by one, with no layout they share: verification,
    reset and the security emails in `core/auth`, an organization's
    notices beside them.
  - MC-3501, on 24 October 2026, on a Mac in dark mode with a light
    Chrome theme: the favicon switched to its dark version, and its white
    stem nearly vanished on the light tab strip. A favicon follows the
    system's scheme, which need not be the tab strip's.
  - Dependabot. Alert 4, esbuild up to 0.24.2, medium and development
    only, comes from drizzle-kit 0.31.11's deprecated
    `@esbuild-kit/esm-loader`, which pins esbuild `~0.18.20`; #113 left
    it open on purpose, since nothing starts esbuild's dev server, until
    drizzle-kit ships without it (1.0, whose fifth release candidate
    came out on 21 October 2026). Alert 6, multer 2.4.0, high and in production code,
    comes from `@nestjs/platform-express` 12.2.0, which pins multer at
    exactly 2.4.0, the newest release on 24 October. Its crash needs an
    asynchronous `fileFilter`, and no upload route sets a `fileFilter`
    at all, so it cannot be reached here.

**Decision — the product before sign-in, the organization after.**
ADR-060's line, kept and filled in:

- **Signed out, every page:** the mark and the product's name above the
  content, and a footer carrying the © line (below): sign-in, register,
  forgot password, reset password, the email confirmation, and the
  status pages shown signed out (not found, offline, the crash page). The
  invitation page and its refusals are the organization's: its logo and
  name stay their heading, and Panivo is in their footer only, so two
  marks never compete.
- **Signed in:** the organization's logo, or its name, tops the rail as
  ADR-060 has it, and "Powered by Panivo", small, sits at the rail's
  foot, in the mark's version for that rail: the on-dark master on the
  dark rail, the light one on the light rail. Folded, the rail shows the
  mark alone, named for screen readers. The menu drawer, below 1200 px,
  ends the same way.
- **Words:** "Powered by" in each language, around the name.

**Decision — the names and the © line are settings.** Like
`VITE_APP_NAME`, each is read when the site is built:

- **A name per language,** `VITE_APP_NAME_` with the language's tag:
  `VITE_APP_NAME_ZH_HANS=品桥` for 中文, the only one set. It names the
  tab, the mark at sign-in, Powered by and Help's foot in that language;
  a language without one uses `VITE_APP_NAME`. The title before the app
  loads, and the home screen's name, stay `VITE_APP_NAME`: `index.html`
  and a manifest each hold one name.
- **The © holder,** `VITE_COPYRIGHT_HOLDER`: "© 2026 Zhenzhong (Bob)
  Zhou", the year the build's own, so nobody edits it in January. Unset,
  as on a fork, there is no © line rather than someone else's name. In
  production Bob's legal name with the name he goes by in parentheses
  (Bob, 24 October 2026), until a registered business's name replaces
  it.

**Decision — one icon on a plate, wherever someone else paints the
background.** The tab, the taskbar, a home screen and a mail app are
drawn by the browser, the system or the mail app, and the app cannot
know their colour. So all of them take one icon that never switches:
the mark on a small rounded navy plate, the dark app icon (Bob, 24
October 2026, on the canvas). It is the SVG favicon, the ICO, the
iPhone's home-screen icon, the manifest's icons and the emails' mark.
Inside the app, where the app paints the background, the mark switches
with Light and Dark as everything else does: at sign-in, at the rail's
foot, in Help's foot, while the app loads.

**Decision — the home screen, the browser's bar and a shared link.**

- **A web manifest,** `client/public/manifest.webmanifest`: its name and
  short name from `VITE_APP_NAME`, icons at 192 and 512 px on the plate,
  one of them maskable with the mark inside its safe zone, and
  `display: browser`. It is there for the icon and the name.
- **`apple-mobile-web-app-title`,** `VITE_APP_NAME`, so an iPhone's
  home-screen icon reads Panivo, not the page it was added from.
- **The browser's bar in the page's colour.** `theme-color`, once for
  light and once for dark, from `tokens.ts`'s page colours (`#F6F7F9`,
  `#161A21`), and the app sets it to its own mode when someone has chosen one; a
  phone's bar then matches the page instead of staying white above a
  dark app.
- **A card when the app's address is shared.** Open Graph tags in
  `index.html`, so a link pasted into a chat shows a card: the name,
  "Inventory, orders, production and invoices.", and a 1200 × 630
  picture of the mark on navy with both names, made from the masters.
  The picture's address must be absolute, so it comes from a build
  setting, `VITE_SITE_URL`; unset, the card has no picture. The card is
  the same for every link, since the pages are built in the browser, so
  a copied invitation link shows Panivo, never the organization. WeChat
  makes its own previews.

**Decision — the mark while the app loads.** `index.html` draws the mark
centred on the page's colour until the app's first page replaces it, in
the mode the app will open in: the device's stored choice, else the
system's, read by a few lines before anything draws, as ADR-075 applies
the text size. In Dark the page is dark from the first moment, with no
white flash. The mark appears only after about 300 ms, so a quick load
shows the page's colour alone rather than a flicker, and it does not
move.

**Decision — the product's emails carry its mark; an invitation does
not.** Every email the product sends about an account or an
organization (verification, reset, the security emails, an account's or
an organization's deletion notices) opens with the mark on its plate and
the product's name in text beside it, from one header they share. The
bare mark's navy stem would vanish in a mail app's dark mode, and Gmail
ignores the code a switching mark would need. The name
is `MAIL_FROM`'s, which already signs them. The mark is a PNG at twice
the size it is drawn, served by the static site from `CLIENT_URL`, with
an empty `alt` since the name beside it says the same: a mail app that
blocks images loses nothing, and Gmail drops an image carried as a
`data:` URL. An invitation is the organization's (ADR-077) and stays as
it is.

**Decision — an organization's documents carry no product mark.** An
invoice, a credit note, a packing slip and the rest are the
organization's papers to its customers, with its logo (ADR-060). A
vendor's mark on a customer's invoice is a thing buyers object to.

**Decision — the colours stay.** ADR-055's brand layer needs no change:
its default accent and the dark rail are already the mark's purple and
navy. Since the two share them, a change to either is made to both: the
masters in `docs/brand/`, the files made from them, and `tokens.ts`
(amends ADR-055).

**Decision — Help's foot names the product.** ADR-081's version line
starts with the product's name, "Panivo · Version 0.7.0 · build 4e58ebc
· Oct 24, 2026", and the © line follows under it. No line of its own
(amends ADR-081).

**Decision — what rides along.**

- **#225's known miss** (amends ADR-051). A budget may carry a known
  miss: its issue, an end date and a ceiling. The typo lookup's is the
  first: #225, 30 November 2026, 450 ms. Until then, a 95th percentile
  over 300 ms and under the ceiling reads "over budget, known: #225" and
  does not fail the run; past the ceiling, with errors, or after the end
  date it fails as before. The weekly run turns green and catches
  anything new; the real fix, ADR-056's index per organization, stays in
  the safety and scale fix-up, and the run turning red on 1 December is
  the reminder.
- **The pre-push hook, kept in the repository.** The hook that refuses
  a push carrying a placeholder author lived in `.git/hooks`, which git
  never commits, so a fresh clone lacked it; it was missing on Bob's Mac
  until 23 October. It moves to `scripts/hooks/pre-push`, set once per
  clone by `git config core.hooksPath scripts/hooks` (the README's
  setup). A hook can be missing or skipped, so CI also refuses a pull
  request whose commits carry the placeholder; the hook stays the early
  warning.
- **Multer 2.5.0, by override** (amends ADR-019). It pins nothing
  against a peer range: `@nestjs/platform-express` pins the vulnerable
  2.4.0 exactly, and the override takes a patched release of the same
  major, the case ADR-019's amendment of 20 October allowed for js-yaml.
  Taken at once, as a security fix, though 2.5.0 came out on 22 October;
  it goes once platform-express depends on 2.5.0 or later. Alert 4 stays
  open, as #113 left it.
- **The chores after #196:** `eslint-plugin-testing-library` for the
  test files, which would have caught #206's and #210's async mistakes;
  and tests for `scripts/i18n-review.mjs`'s export, `--since` and
  import, proved by hand until now.

**Tests.** Component tests: the signed-out header and footer, with the
holder set and unset; the name in 中文 with its setting and without; the
rail's foot on both rails and folded; Help's foot. The server's e2e
suite: each email the product sends opens with the header, and an
invitation does not. Playwright: the signed-out pages and the rail's
foot as rows of `accessibility.spec.ts`, in both modes; the manifest,
`apple-mobile-web-app-title`, `theme-color` and the Open Graph tags
served; the loading mark in the stored mode before the app starts. `perf/`: the verdict below the
ceiling, above it and after the end date. CI's author check: a commit
carrying the placeholder refused.

**Considered and not done.**

- **The mark on an organization's documents.** Above.
- **The mark in an invitation.** ADR-077's reasons hold.
- **The tab icon switching with the system,** as #201 built it. The
  system's scheme need not be the tab strip's: MC-3501 found the white
  stem nearly invisible on a light Chrome theme with the system dark.
- **The tab icon following the app's own Light or Dark.** The browser
  draws the tab strip; the app's choice changes only the page, so Dark
  in a light browser would put the white stem on a light strip. And the
  app starts on System, so for most people it would be the icon above.
- **A dark loading screen for everyone.** Someone in Light would see a
  dark flash before a light page, the same fault the other way round.
- **A drawn wordmark.** The name is set as text in the app's font: sharp
  at any size, read by a screen reader, and 品桥 needs no second image.
  Its cost is that 品桥 takes each system's Chinese font.
- **A manifest per language.** A manifest holds one name, and browsers
  read no per-language one widely.
- **`display: standalone`.** A home-screen Panivo would open without the
  browser's bar and its back button, an app with no offline mode.
- **An override for esbuild.** drizzle-kit's loader pins 0.18, and 0.25
  is seven breaking releases on in a 0.x package, under a deprecated one
  nobody tests against it: the kind ADR-019 rules out, for an alert that
  cannot be reached.
- **Raising the typo budget.** A known miss with an end date says it is
  owed; a raised budget forgets.

**Deferred — each with what brings it in.**

- **A registered business's name on the © line.** Trigger: the
  business registered. One setting.
- **Terms and a privacy policy,** linked in the signed-out footer above
  the © line. The app keeps personal details (names, emails, photos,
  sign-in addresses), and privacy laws expect a published policy before
  anyone else's are kept. Trigger: the first user outside Bob, which the
  public demo or plans and billing bring.
- **The name by language in emails.** The server signs with `MAIL_FROM`'s
  one name. Trigger: a Chinese reader, Bob's mother's review included,
  who finds Panivo out of place there.
- **A drawn wordmark.** Trigger: wanting one look everywhere, print
  included.
- **The mark in an organization's emails.** Trigger: ADR-060's for the
  colour on emails, an organization whose customers receive email from
  it.

**Consequences.**

- No migration.
- Client: the settings read beside `VITE_APP_NAME` by `vite.config.ts`'s
  app-name plugin and compiled in as the name is; the signed-out pages'
  header and footer on every signed-out page; the rail's foot; Help's
  foot; in `index.html`, the loading mark, `theme-color`,
  `apple-mobile-web-app-title` and the Open Graph tags; the manifest, the
  icons on the plate and the preview's picture in `client/public/`, made
  from `docs/brand/`'s masters; words in three languages.
- Server: one header for the product's emails, its PNG served by the
  static site.
- `perf/`: the known miss. CI: the author check. `scripts/hooks/pre-push`
  and the README's setup line. `server/package.json`'s override.
- Render: the static site's Environment takes `VITE_COPYRIGHT_HOLDER`
  (`Zhenzhong (Bob) Zhou`), `VITE_APP_NAME_ZH_HANS` (`品桥`) and
  `VITE_SITE_URL` (the site's own address), set before the merge's
  deploy, since the site reads them only when it builds (`render.md`).
- Manual checks: MC-3501 and MC-3502 grow (the plate on a light and a
  dark tab strip and a dark taskbar, the manifest, the name in 中文), and
  new checks cover the signed-out header and footer, the rail's foot,
  Help's foot, an email's header in Mailpit in a dark mail app, a link
  pasted into a chat, a phone's bar in each mode, and the loading mark in
  Dark on a slow connection.
- Designed on the canvas before building, as ADR-060's Branding was; the
  brief and the boards go in `tmp/adr-082/`.

**Amendment (October 2026) — as built (#247).** What building settled:

- **The organization moves to the rail's top** (amends ADR-060). From
  1200 px its logo, or its name, tops the rail with the fold button beside
  it, and links Home; the top bar keeps search, Help, the bell and the
  account. Folded, one plate is the expand button. It shows a roughly
  square logo (at most 1.25 : 1), else the organization's initials on its
  accent in a contained button's colours, made by script with legal
  endings left out (WIDE Naturals Inc. gives WN, 清禾药业有限公司 gives
  清禾). Its name reuses the app's pair with Collapse navigation, the
  initials first as WCAG 2.5.3 asks: "WN, Expand navigation (WIDE Naturals
  Inc.)", or "Expand navigation (…)" with a logo. Below 1200 px the top
  bar and the drawer are unchanged. A small square logo of the
  organization's own, uploaded separately, is the next pull request, the
  plate's first choice ahead of the initials.
- **The rail's foot is pinned** under the links in a window taller than
  about 500 px. The links scroll above it and fade into the rail just
  above its line while more lie below; 58 px were won back, so every link
  fits at 1440 × 900.
- **The signed-out frame** holds sign-in, register, forgot and reset
  password, the email confirmation, the signed-out Page not found, and
  the start-up pages: `OfflinePage` for "Could not reach the server", and
  the new-version and installing pages. Each has the language and
  text-size controls. The crash page and offline page this ADR named do
  not exist signed out; a render error there still shows an empty page
  (#244). Every invitation state is footer-only. The name is text at the
  type scale's title size, 25 px, not the board's 32.
- **Tabs** are worked out from the reader's language each time
  (`lib/tab-title.ts`), the sign-out countdown included; a record's tab
  keeps its section, "SO-DEMO-1 · Orders", as #201 had it.
- **Help's foot** names the product and holds the © line, with no mark:
  the plate's decision listed it among the places the mark is drawn, by
  mistake.
- **The loading mark** sits beside `#root`, not in it, above the app until
  its first screen is on view: a page, `OfflinePage` or a version page.
  `#root` is hidden from screen readers meanwhile. A thin bar appears
  550 ms after the page starts if the mark is still up, and stands still
  under reduced motion. Its script, hashed into `/assets/` and cached a
  year, reads the stored mode and sets the page's colour, `color-scheme`
  and default text colour at once, so Safari never draws the browser's
  black text on the dark page. If the app's entry fails to load, it takes
  the mark down and shows one line with Reload in the reader's language
  (`loading.failed`, `loading.reload`). Its colours, shape and waits come
  from `tokens.ts`.
- **Emails** go through `MailBrand.send`, which adds the header. The mark
  appears only once the server has seen `CLIENT_URL` +
  `/brand/mail-mark.png` answer as `image/png`, asked before the hourly
  emails start and every 10 minutes until it does, misses after the first
  logged at debug. If the mark ever changes, its file takes a new name,
  since mail apps keep the images they have fetched.
- **Render answers a missing `.png` or `.js` with a 404 and `text/plain`;**
  only a path with no extension, an `.svg` or a `.webmanifest` gets
  `index.html` and a 200. The decisions after step 7 said otherwise. The
  live check runs once the build is the commit's, takes the manifest on
  any type but `text/html`, and the other files only on their own.
- **Files:** a master of its own for the maskable icon, since Android's
  mask would cut the plate's corners; the preview's names as outlines
  from Source Sans 3 and Noto Sans SC, under the SIL Open Font License,
  made once outside the repository.
- **What rode along, as built:** multer 2.5.0 by override; the hook in
  `scripts/hooks/`, and the author check in a workflow of its own
  (`authors.yml`) on every pull request, docs-only ones included, and in
  `scripts/verify.sh`; #225's known miss; `eslint-plugin-testing-library`
  with `no-node-access` and `no-container` off. Its async rules catch a
  find, a user event or a `waitFor` left without `await`; the mistakes of
  #206 and #210, checking an effect's result too early, stay a rule people
  hold. Tests for `scripts/` on Node's own runner, and `perf/`'s spec run
  with the server's unit tests, which CI's server job now runs too, where
  before only `verify.sh` did (amends ADR-067). `MAIL_FROM` names Panivo
  in the workflows. Claude Code Review fails when it ends without a review
  (#243), and says so when a pull request changes its own workflow, which
  the action refuses to run.
- **Deferred, added:** the link card in the reader's language (it reads in
  English, since `index.html` holds one language), with the trigger of
  the name by language in emails; and a sending domain of Panivo's own.
  Mail goes from `wide-naturals.ca`, the domain Bob has today, with DKIM
  and SPF verified and DMARC at `p=none`. Trigger: the first customers.

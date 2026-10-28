---
status: accepted
date: 2026-10-20
areas: [home, invitations, help]
amends: [ADR-016, ADR-058, ADR-063, ADR-069, ADR-077, ADR-078]
amended-by: [ADR-080]
---

# ADR-079 — A newcomer's first sign-in: a welcome on Home, and help on every page (amends ADR-016, ADR-058, ADR-063, ADR-069, ADR-077 and ADR-078)

## Context

ADR-077 and ADR-078 settled how a person arrives: by a link,
to an organization that exists or to one they set up. What they meet next
is the Home everyone has. Nothing says what this account may do here, so a
Viewer learns it from buttons that are not there and an Admin from being
refused. The inviter's note was read once, on the invitation page, and is
gone from sight. The first Owner of an organization the operator invited
starts unconfirmed (ADR-078), and inviting waits on confirming, which only
a banner says. And nothing explains a screen: ADR-058 deferred user guides
until "the first customer onboarded without someone beside them", and
ADR-078 has made that the normal case, a printed link and nobody beside
the person who opens it.

This is the third of the three onboarding pieces. What it builds has to
hold when job roles come (Open decisions), and when one person belongs to
two organizations (ADR-077, *Deferred*).

Checked before drafting, as the working agreements ask:

- **Fired.** ADR-058's deferred user guides, by the trigger above: taken
  here, kept with the client rather than under `docs/user/` (below).
  ADR-078's first Owner, unconfirmed, for whom it left a step to this ADR:
  taken here. "Job roles" in Open decisions, whose trigger includes this
  checklist, which with three roles reads as two lists: it fires, and is
  not taken here, since job roles are already next after the chain and a
  checklist built from permissions needs no change when they come.
  ADR-072's watch list, the auth provider's test, which fires because
  #144's fix touches the auth provider (below).
- **Not fired, and kept in step.** ADR-058's sample data, a practice
  organization, which waits on one person in two organizations. ADR-077's
  deferred items, all unchanged; its "a tour on first sign-in", considered
  and not done, points here, and this ADR keeps to no tours. ADR-078's
  Home listing the invitations waiting for an address, which still waits
  for a lost link. "Changing your own email address": the confirm step
  shows a mistyped address sooner but cannot fix one, so its trigger
  stands. "What unverified access should be limited to": unchanged.
- **Corrected.** The Open decisions entry took the permission descriptions
  to be translated already. They are not: `PERMISSION_DESCRIPTIONS` is
  English, seeded into `permissions.description` with
  `onConflictDoNothing`, and no screen shows it. What a person may do
  needs words of its own, in the client's catalogues (below).
- **Open issues.** #144, another device's session keeping an organization
  the account has left, is in this area and rides along (below). #142, a
  Content-Security-Policy for the client, keeps its own PR: guides are
  text bundled with the client, with no images and nothing fetched from
  elsewhere, so nothing here is one more thing a policy must allow. #129,
  English left inside translated messages, stays open: the guide check
  below finds a missing translation, not English inside one.

## Decision — a welcome on Home, the person's own

A newcomer's first
page is Home, as everyone's is, and it leads with a card of their own: a
greeting by name to the organization, the inviter's note, what they can do
here, and their first week. Not a dialog in front of the page, and not a
page of its own: the work is right there, and they can start on it at
once.

- It belongs to the membership, not to the account and not to the
  organization: someone in two organizations, one day, is a newcomer in
  each. Getting started (ADR-058) stays the organization's.
- It shows from joining until the person dismisses it, every item of their
  first week is done, or two weeks have passed since the membership began,
  whichever comes first. Two weeks, because a part-timer's first week is a
  few days. Members from before this ADR joined more than two weeks ago,
  so none of them sees it.
- Dismissing is the person's alone and per membership, in
  `memberships.welcome_dismissed_at` (migration 0070). It changes only
  what they see, as a recently opened record does (ADR-058), so it is not
  audited.
- Whoever started the organization, by registering, by an organization
  invitation or with Start an organization (ADR-078), has no inviter:
  their card has no note, and Getting started below it is their real list.
- In the reader's language (ADR-054). Nothing in it lives in a hover
  tooltip, which phones and handhelds do not have.
- It names the day it goes ("until 3 November"), so it never vanishes
  unexplained. Its foot says where Help is, beside the bell: that line is
  the whole introduction to Help, in place of a tour.
- Dismissing offers Undo for a moment, and says that what you can do here
  stays on Account.
- While the card lists Confirm your email address, the banner that asks
  the same is not shown on Home, so it is not said twice; it stays on
  every other page.
- On a phone, what you can do here folds into one row, opened by a tap,
  below the first week: what to do before what to read, and the card one
  screen long rather than two. On a computer it is open.

## Decision — what you can do here, from permissions

One sentence per
area, for the areas the person may touch: stock and locations; products
and licences; orders; production; invoices and returns; costs, prices and
tax; partners; people and the organization. Each sentence is put together
from what they hold: "see what is on hand and where" for `stock.view`
alone, "receive, ship and move stock" with `stock.move`, "correct a count"
with `stock.adjust`. An area they cannot touch is left out, not listed as
refused.

- Built on the client, from the session's permissions, never from a role's
  name, so it grows finer with job roles and needs no change when they
  come. The words are the client's, in its three catalogues (ADR-054): one
  phrase per permission or group of permissions, joined as each language
  joins a list (`Intl.ListFormat`). The map is keyed by the generated
  `Permission` type (ADR-068), so a permission without a phrase does not
  compile.
- It ends with whom to ask for more: up to three members who may change
  roles (`roles.assign`), those who joined first first, by name; never the
  reader, and nobody for a reader who may change roles. The names come
  from the server, which alone knows who holds what.
- Someone who holds every permission reads one line, "You may do
  everything here, including settings and closing the organization",
  rather than eight. Still from the permissions, not the role's name: it
  holds for whoever holds them all.
- Each name to ask opens that person's page on People (ADR-063), where
  their work phone and extension are.
- The same block sits on Account, under the person's role in this
  organization, so it outlasts the card.
- `PERMISSION_DESCRIPTIONS` stays as it is, English, in the database:
  nothing a person reads comes from it.

## Decision — the inviter's note

The note an inviter wrote (ADR-077)
shows on the card as typed, plain text, under the inviter's name and photo
or initials (ADR-063), the name opening their page on People. It is read
from the invitation that made the membership, which ADR-077 keeps with it
for this. Once the inviter has left or deleted their account, the note is
from the organization, as the email and the invitation page already say
(ADR-077). No note and no inviter for whoever started the organization.

## Decision — the first week, ticked by what the person does

Up to five
items, each a short line with a button to where it is done, each ticked by
what the person has done here since joining, never by hand: a ticked box
proves nothing, and Getting started ticks the same way (ADR-058).

- **Confirm your email address,** listed for whoever joined unconfirmed:
  the first Owner from an organization invitation (ADR-078), and whoever
  accepted a copied link (ADR-077). Ticked once they confirm. Resend
  beside it, and, for someone who may invite, a line saying inviting waits
  for it (`email_unverified`). First, since it unlocks the rest.
- **Say who you are:** a photo or a job title (ADR-063), ticked when
  either is set.
- Then the first three of these the person may do, in this order: **look
  up a product or a lot** (`products.view` or `stock.view`), ticked by
  opening one, which recently opened already records (ADR-058); **receive
  stock** (`stock.move`); **raise an order** (`orders.create`); **ship an
  order** (`orders.ship`); **plan a production run**
  (`production.create`); **draft an invoice** (`invoices.create`). Those
  five change something, and each is ticked by the person's own entry in
  the audit log since joining, read through its actor index. Someone who
  may do none of the five gets **open an order** (`orders.view`) after the
  lookup, ticked the same way the lookup is.
- While Getting started shows on Home, the list keeps only the person's
  own two items, confirming and saying who they are: the organization's
  steps are then that member's list, and the same task twice would read as
  two things to do.
- A done item says what was done, and opens it: "You opened lot
  NN-2410-07" opens the lot, "Photo added" opens Account.
- Chosen and ticked on the server, from the member's permissions, and sent
  with Home; the client words each item and links it.

## Decision — help on every page

One button in the top bar, beside the
bell, named Help. It opens the guide for the page the person is on, in
their language, and while it is open it follows them to the next page's
guide. At its foot, the guides for every page the person can open, and
where what they can do here is.

- It slides over the right of the page, nothing dimmed, so the page still
  works while they follow the steps. Where the screen is wide enough for
  the page to keep its full width beside it, it sits beside the page
  instead, in the space the page does not use. On a phone, full screen
  with Close. No page ever gets narrower for Help, so no page needs
  walking again at every width and text size (ADR-075). Esc or Close shuts
  it.
- Help in words, with its icon, where the bar has room, which a newcomer
  finds sooner than a bare icon; the icon alone on a phone, named Help for
  screen readers. At 320 px with Larger text the organization's mark shows
  its logo alone, so the bar's six 44 px targets fit (ADR-075), checked on
  a real phone.
- Learn more opens the same panel at the right guide and the right
  section: on every empty state (`EmptyState`), on each Getting started
  step, and beside a hard setting, at the end of its section's heading or
  of a field's own help text. The first hard settings: numbering, the
  licence policy, idle sign-out, costs and exchange rates, and price
  lists.
- No "?" on every field. Phones have no hover, so each would be a tap and
  a popover; each would be one more text in three languages; and a field's
  help text, about 115 of them, already says what that field needs, always
  visible and translated. A field that needs more than a line gets Learn
  more.
- No tours pinned to the screen: they break with every change of layout,
  and the layout changes. No screenshots or video either: they go stale,
  and would need one per language.
- The signed-out pages keep their own words, and have no Help.

## Decision — guides with the client, and checked

Guides change and
translate with the code, so they live with it, not under `docs/user/` as
ADR-058 first had it.

- One guide per area of the rail, about twenty, each a Markdown file per
  language: `client/src/help/guides/<language>/<guide>.md`. Every
  signed-in route maps to exactly one guide: Orders covers the list, a new
  order and an order.
- Loaded when the panel opens, one guide in one language at a time, so no
  screen downloads them.
- A fixed subset of Markdown: headings, paragraphs, lists, bold, and links
  to pages of the app. Drawn by a small renderer of our own, with no raw
  HTML, no images and nothing fetched, its links the router's. No new
  dependency: a Markdown library would bring dozens of packages to a
  client with nine dependencies, for a subset this small.
- A section that a Learn more opens has an id beside its heading, the same
  in every language, so the link survives translation.
- A unit test, run by `npm run verify` and so by CI, fails when a
  signed-in route has no guide, a guide lacks a language, a guide's
  languages disagree on its sections, a guide uses Markdown outside the
  subset, or a link names a page or a section that does not exist. The
  signed-in routes become a list that `App.tsx` renders, so the test reads
  the same list the router does.

## Decision — how a guide is written

Short: what the page is for; the
few things done there, each as steps; the words met on it, as the glossary
has them; and why something might be refused. The same for every reader:
where a control needs a permission, the guide says so ("only someone who
may issue invoices sees Issue") rather than hiding the section from those
without it. Plain words, the reader addressed as "you", and no control
described by its position or colour. English first, written from the
screens themselves; French and Chinese drafts beside it, beta as the app's
are (ADR-054), read by someone fluent when one can be found.

## Decision — the inviter hears, and colleagues see who is new

A
newcomer's first day goes better when someone greets them, and today only
the audit log knows they arrived.

- When an invitation is accepted, its inviter, if still a member, is told
  in the bell (ADR-036), in their own language: "Wang Fang accepted your
  invitation and joined Northside Naturals as a Viewer". It opens the
  newcomer's page on People. The bell alone, not email: it is not a
  security event (ADR-037).
- People marks whoever joined in the last two weeks, "New · joined 16
  Oct", and its summary line says how many, so colleagues know whom to
  greet. The same two weeks as the welcome, from the membership's start.

## Decision — #144 rides along: a session finds its organization again

A
session's organization is set only by its own device, so another device of
the same account keeps one the account has left. ADR-078 makes that a
newcomer's problem: someone with no organization, signed in on a phone and
a laptop, accepts an invitation on the phone, and the laptop's Home still
offers Start an organization, which the server then refuses. Its own
commit, ahead of this ADR's server, closing #144.

- When a session's organization is none, or no longer one of the account's
  memberships, the session middleware picks one as sign-in does, today the
  oldest membership, and stores it. That covers every way a membership
  changes at once: leaving, removal, deletion, accepting, starting. A
  session whose organization is still valid is never moved.
- The client reads the session again when its window regains focus, so an
  open page catches up without a reload. That touches the auth provider,
  so ADR-072's watch list brings its test: the auth provider passing the
  zone on.
- Carrying the organization on each request, for one person in two
  organizations, stays with that ADR (ADR-077, *Deferred*).

## Considered and not done

- **A welcome dialog or page on first sign-in.** It stands between the
  person and the work, is closed unread, and cannot be found again.
- **A product tour,** pointing at controls one at a time. It breaks
  whenever the layout changes, and teaches where things are rather than
  what they are for.
- **Ticking the first week's items by hand.** It records that someone
  pressed a box.
- **Guides on a help site of their own.** They would drift from the code,
  and be translated apart from it.
- **What you can do here from the role's description** (ADR-077). Three
  sentences for three roles: nothing finer once job roles come, and
  nothing for a role an organization makes.
- **A Markdown library.** Above.
- **A "?" beside every field.** Above, under Help.
- **Help always beside the page.** Every page would get narrower when it
  opens, and each would need walking again at every width and text size.

## Deferred — each with what brings it in

- **Searching the guides.** Trigger: enough guides that the list at the
  panel's foot is slow to scan.
- **Help on the signed-out pages.** Trigger: a question about signing in,
  accepting or setting up that the page's own words do not answer.
- **Asking for help from the panel,** by a message to whoever may change
  roles, or to support. Trigger: the operator's console and support access
  (Open decisions).
- **A first week per job,** "your first week receiving goods". Trigger:
  job roles.
- **Screenshots or short videos.** Trigger: a guide that words alone
  cannot make clear, with a way to keep them current in three languages.
- **A keyboard shortcut for Help.** Trigger: someone asking for one, with
  a key that does not collide with typing.

## Consequences

- Migration 0070: `memberships.welcome_dismissed_at`.
- Server, in `modules/home` and `core/auth`: `GET /v1/home` gains
  `welcome`, null unless the card shows, with the inviter and their note,
  the first week's items and whether each is done, and the names to ask;
  `POST /v1/home/welcome/dismiss`, the person's own, with no permission
  and in `NOT_AUDITED` with its reason; `GET /v1/account/membership`,
  beside leaving's `DELETE`, the role and the names to ask for Account,
  from the same function as Home's. `npm run api` after the routes change.
  Home's perf probe covers a newcomer's Home (ADR-051). E2e tests: who
  sees the card and until when, each item ticked by its own act, the
  shorter list while Getting started shows, the note after its inviter has
  left, dismissing per membership. The inviter's notification, written when
  the invitation is accepted, with its e2e test in each language; the
  People list's response gains when each member joined.
- #144: the session middleware's repair, with the e2e tests the issue
  lists; the client's read on focus, with its test and the auth provider's
  zone test.
- Client: Help and its panel, over or beside the page; the renderer, the
  route list, the guide map and the check; Learn more on empty states,
  Getting started's steps and the first hard settings; the welcome card on
  Home, with Undo, the banner hidden there while it asks the same, and the
  phone's fold; what you can do here on Account; New on People. Designed
  on the canvas: the card for a Viewer, an Admin and a founder not yet
  confirmed, in English and 中文 on a phone, and its other states; where
  Help sits on each screen; the panel on a computer and on a phone; Learn
  more from an empty list, a step and a hard setting; the top bar at four
  widths; the inviter's bell; People. Unit tests for the phrases, the
  renderer and the card; Playwright for the panel following the page, a
  Learn more and the card; the panel and the card in `accessibility.spec`.
- The guides, about twenty in each of three languages, a commit of their
  own.
- Docs: manual checks section 32, reading the guides in English and 中文
  among them; the glossary's welcome, first week, Help and guide; the
  handoff.
- Build order: this ADR; #144; the server; the client after the design,
  Help, then the guides, then the welcome; the docs last, after the
  reviews. Built by Claude Code, a prompt per commit (engineering.md, *How code
  is delivered*).

## Amendment (October 2026) — as built

What building it, its design
review on the canvas, its reviews and its two walkthroughs settled:

- **Help beside the page on a laptop, reversing "no page ever gets
  narrower for Help".** Over the page, Help covered what a person needed
  next on any laptop between about 1280 and 1850 px wide: every list
  page's top-right action, Getting started's buttons, the welcome's
  Dismiss, Orders' filters. A focused control could sit under it, which
  fails WCAG 2.4.11. On a computer the rail now folds while Help is open,
  and comes back as it was when Help closes, and the page takes the width
  left beside Help, as long as that leaves it about 720 px. A Playwright
  test visits every signed-in route at 1280 × 800 with Help open: nothing
  scrolls sideways, the title row's actions show, and focus moved into the
  page is never under Help. Below that width, which is windows under
  about 1140 px, or under about 1265 px at Large text and 1330 px at
  Larger, Help still slides over the page, and a control under it can be
  focused out of sight. Phones, below 600 px, keep Help full screen.
- **Help's other rules.** The panel is 420 px, in rem, so it grows with
  the text. It stays above a page's dialog, readable and scrollable by
  mouse or touch, nothing in it pressable until the dialog closes; the
  keyboard stays in the dialog, and a screen reader already hears only the
  dialog. A guide chosen by Learn more or from the foot stays until the
  page's address changes; a tab's `?tab=` keeps it. Opening Help focuses
  the guide's title, and a Learn more its section's heading; closing
  returns focus to whatever opened it; Esc closes it only when focus is
  inside it. The top bar's Help toggles. The word Help in the welcome
  card's foot, its icon part of the same button, opens Help, and pressed
  again keeps it open, as a Learn more does: people pressed it. Every
  target in the top bar is at least 44 × 44 px at any text size, and below
  360 px with Larger text the organization's mark shows its initials
  alone.
- **The guides.** Twenty-one, in three languages, from 200 to 443 words in
  English, written before the panel that reads them, the reverse of the
  build order above. Every section has an id, the same in each language,
  prefixed `help-` in the page so it never clashes with the page's own.
  Learn more opens two sections beyond the first table, `invoices#credit`
  and `price-lists#prices`, and its targets are typed from the guide map,
  so one naming a section the map lacks does not compile. The signed-in
  routes are one list, `SIGNED_IN_ROUTES`, which the router and the check
  both read. Vitest's on-disk module cache does not see a guide just added
  until `npx vitest --clearCache`; CI starts without one.
- **No "?" on every field,** as decided: Learn more sits beside numbering,
  the licence policy, idle sign-out, exchange rates, stock value and price
  lists.
- **The card.** It shows through `lastDay`, the joining day plus 14 in the
  organization's zone, so on 15 calendar days; `joinedOn` is sent for "You
  joined today". The founder is the membership made in the same
  transaction as its organization, `memberships.created_at` equal to
  `organizations.created_at`, since registration, Start an organization
  and an organization invitation all go through `startOrganization`. Not
  the oldest membership, which would pass to the next member, and their
  note with it, if the founder left; not "no invitation behind it", which
  also describes the demo's team. Joined unconfirmed means the address was
  confirmed after the membership began, or not yet; both ways of accepting
  an emailed link now stamp the confirmation with the transaction's time,
  without which everyone who joined that way read as unconfirmed. The
  items' keys are `confirmEmail`, `sayWhoYouAre`, `lookUp`, `openOrder`,
  `receiveStock`, `raiseOrder`, `shipOrder`, `planRun` and `draftInvoice`.
  Receiving is ticked by `order.line_received` or a receipt among stock
  movements; a lookup by Recently opened, asked for by record kind, which
  keeps 30 records, so opening thirty other things un-ticks it. A done
  item names what was done and opens it, or says Done once the record has
  gone.
- **The card on Home.** While Getting started shows, it follows the
  welcome card directly, before the quick actions, which are then
  outlined, leaving its first open step the page's one primary button.
  Dismiss moves focus to Home's greeting, as Getting started's Dismiss now
  does; Undo comes next in the tab order and stays while focus or the
  pointer is on it (WCAG 2.2.1), as the product gallery's now does. The
  confirm banner is hidden on Home while the card lists that item.
  Progress bars have a grey track, since the pale one read as full at 0.
- **What you can do here.** One map keyed by the generated `Permission`
  type. Permissions acting on one thing share its noun ("raise, change,
  confirm and cancel orders"), only verbs the reader holds are said, and
  phrases are separated by semicolons (；in Chinese). Whom to ask is sent
  as an id and a name; deleted accounts are left out and suspended ones
  are not, as on People. `MemberAccessService`, in `core/authorization`,
  answers Home and `GET /v1/account/membership` alike.
- **The inviter.** ADR-077's rule for naming them is one join condition,
  `core/invitations/inviter.ts`, used by the email, the invitation page,
  the welcome and the notification. The notification is written after the
  acceptance commits, its resource the newcomer, so the bell opens their
  page on People; built-in roles keep their English article, and a role an
  organization makes is named as it is. People already sent `memberSince`;
  New is reckoned from it in the organization's zone.
- **Permissions brought in line with what they gate** (amending ADR-016).
  Changing a member's role needs `roles.assign`, not `users.update`;
  `users.update` then gated nothing, and went (migration 0071). The roles
  list needs `roles.view`, not `users.view`. Add inside on Locations needs
  `locations.create`. Inventory's row menu shows to whoever may see stock,
  holding only what they may do. The Admin's stored line says invite, not
  add (0072), so the export's `roles.csv` says what the screens say.
- **#144.** The repair, `chooseAgain`, runs before the idle check and on
  background requests, leaves the old pointer when the account has no
  membership, and shares `SessionService.firstOrganizationOf` with sign-in
  and leaving; closing an organization keeps its bulk SQL, with a comment
  naming the rule. The client reads the session again on focus and when
  the page becomes visible, one read at a time, sent in the background,
  and keeps the session it has when nothing changed.
- **Found on the way.** The root `.env`'s `NODE_ENV=development` reached
  Vite through `loadEnv('..')`, so every local build shipped development
  React; a local main chunk is now 453 kB, as CI's always was. MUI's
  `:focus-visible` warning in the account menu came from its preferences'
  selects inside menu rows, and each row now stops its select's focus and
  blur. The bell's badge kept a hidden 0 inside its button's name. Filed:
  #147, no way to remove a member on screen; #148, refusals with internal
  or off-glossary wording; #149, copy inconsistencies the guides found;
  #150, the translation review leaving out the guides; #151, the account
  menu's preferences out of the keyboard's reach.
- **Who sees the card once this ships:** everyone who joined in the last
  two weeks, not only those who join from now on. The demo's team joined
  months ago, and one colleague, Fatima Haddad, three days before seeding,
  by the Owner's invitation with a note.
- **Still open.** Five ADR-077 messages would read "a Accountant" once
  organizations can make roles: job roles' to fix. The French and Chinese
  guides, and an Admin's longer sentences, want reading by someone fluent
  (#150).
- **Reviewed and walked.** `/simplify`, then `/code-review`, then
  `/usability-walkthrough` along two journeys: the Chinese bookkeeper as a
  Viewer, from an emailed invitation to Help on Orders; the French founder
  on a phone, from an organization invitation to the welcome with Getting
  started below it.

## Amendment (October 2026) — any role's first week, and whom to ask (ADR-080)

The first week's Receive shows for whoever may receive against
an order, opening the confirmed purchases for someone who may not move
stock. Whom to ask, on Home and Your access, names up to three members who
could give what is missing, as every refusal now does (ADR-080, as built).
Permission lines are translated on the server.

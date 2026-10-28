---
status: accepted
date: 2026-10-26
areas: [invitations, mail]
amends: [ADR-077, ADR-082]
---

# ADR-083 — The emails: one layout for every email (amends ADR-077 and ADR-082)

## Context

The app sends 14 emails, built one by one in six places:

- confirm your email and reset your password, inline in
  `core/auth/auth.service.ts`;
- a new sign-in, a password changed and a password reset (ADR-037), in
  `core/auth/security-mail.ts`;
- an account's deletion scheduled, cancelled and done (ADR-069), through
  `compose()` in `core/auth/deletion-mail.ts`;
- an organization's deletion scheduled, cancelled, a week away and done
  (ADR-070), through the same `compose()`;
- the operator's, when an organization invitation is accepted (ADR-078),
  in English, in `core/invitations/operator-mail.ts`;
- the invitation (ADR-077), the organization's, in
  `core/invitations/invitation-mail.ts`, without the product's header.

`org:invite` prints its link and emails nothing. Each HTML part is a
fragment of paragraphs: no document, no language, no width, no font, and
every main link plain text. ADR-082 gave the product's emails a header
and no more. The invitation's small print already says "If the button
doesn't open, copy this address into your browser", though its Accept is a
plain link. A reply to any of them goes to `no-reply@`, which nobody
reads: the domain has no mailbox (`docs/runbooks/services.md`). This ADR
gives every email one layout, and keeps every word.

Checked before drafting, as the working agreements ask:

- **Fired, and taken here.** None of the Deferred lines. What this answers
  is ADR-082's own finding while checking: emails built one by one, with no
  layout they share.
- **Not fired, and kept in step.**
  - ADR-060's colour on emails (an organization whose customers receive
    email from the app): every button is the product's purple, the
    invitation's too.
  - ADR-082's mark in an organization's emails, which ADR-060's amendment
    thought this design might take with the square logo: not taken. Mail
    apps block images and Gmail drops a `data:` image, so the logo would
    need an address anyone can fetch without signing in, which the file
    route never gives. ADR-077's organization named in words stands.
  - ADR-082's name by language in emails: its trigger is a Chinese reader
    who finds Panivo out of place there. Bob's mother's review is under
    way and slow; the handoff asks after it from 29 October 2026.
  - ADR-082's sending domain of Panivo's own and DMARC at `p=none`, and
    its terms and privacy policy: the first customers', and the first user
    outside Bob's. A footer for the product's emails waits with them
    (Deferred).
  - ADR-064's licence notices by email: in-app only until a licence lapses
    while nobody who would have acted opened the app. With this layout,
    one is a list of blocks.
  - ADR-037: the security emails stay the product's, with no one-click
    action, so no button (below).
  - #170: the button is at least 44 px tall. #142: an email loads nothing
    but the mark, from our own static site. #150: no word changes, so
    nothing new for the Chinese review.
  - The handoff's watch on Playwright's global setup missing its
    confirmation email: this rebuilds that email, so if it recurs on this
    branch, the watch's steps come first.
- **Found while checking.**
  - No email carries `lang`, so a Chinese email tells neither a mail app's
    font choice nor a screen reader which language it is in.
  - `compose()` already lays out 7 of the 14: where the layout starts.
  - The security emails' `#666` is the only grey in any email.
  - Links point at `onrender.com` while mail comes from
    `wide-naturals.ca`, a mismatch spam filters weigh a little; Panivo's
    own domain settles both.
  - The README says CLAUDE.md comes "with two project skills"; there have
    been three since ADR-081.

## Decision — one layout, built from blocks, in our own code

A small
builder in `server/src/shared/mail/` takes an email as blocks: a greeting,
a paragraph, a button, details (a label and a value per row), a quote,
small print and a footer. It writes the HTML part and the text part from
the same blocks, so the two cannot disagree. The product's header
(ADR-082) is the first block of the product's emails: MailBrand draws it
as before, and still sends every product email, so none can leave it out.
Laravel's notification emails are built the same way: a greeting, lines,
one action and the address under it.

- **The text part stays as it is,** character for character, in every
  email and language. The preview's first run, before the layout, is what
  the build compares with.
- **The builder escapes every value;** the only markup an email holds is
  the builder's own. Today each of the six places escapes for itself.
- **Styles are inline.** A `<style>` block holds only extras, the dark
  grey and Outlook's own rules, since some Gmail apps strip it.
- **Two tests hold every email:** its HTML stays under 50 KB, half of the
  102 KB at which Gmail cuts a message off, and it loads nothing but the
  mark: no other image, font or tracker.
- No new dependency. MJML or React Email would bring a compiler, or
  React, to the server for 14 emails whose words already live in the
  catalogues.

## Decision — a whole document, in its language

`<!doctype html>`, with
`lang` and `dir` on `<html>` and again on the outermost element, since
Gmail drops the `<html>` element and its attributes. The subject as
`<title>`. Meta tags for the character set and the viewport;
`color-scheme` and `supported-color-schemes` as `light dark`;
`format-detection` off for dates, addresses, telephone numbers and email
addresses, so iOS Mail does not turn a deletion email's day into a blue
link; and `x-apple-disable-message-reformatting`. Every table used for
layout has `role="presentation"`, as the header's has, so a screen reader
does not read it as a table; the security emails' details stay a table of
data.

## Decision — the look

- One column, at most 600 px wide, the full width on a phone. Outlook on
  Windows ignores `max-width`, so a fixed 600 px table wraps the column
  for Outlook alone, in its conditional comments.
- The system's font, `-apple-system, BlinkMacSystemFont, 'Segoe UI',
  Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei',
  'Noto Sans SC', sans-serif`, at 16 px with a line height of 1.6.
  Outlook on Windows falls back to Times New Roman when the first font is
  not installed, so Outlook alone is given `Arial, 'Microsoft YaHei',
  sans-serif`.
- Small print at 14 px in one grey, `#5B6575`, 5.9 : 1 on white,
  replacing the security emails' `#666`.
- The product's emails keep ADR-082's header. The invitation keeps none:
  its heading, Join {organization}, opens it, and its last line, Sent for
  {organization} by Panivo., is small print.

## Decision — buttons only where the action already has words

Confirm
your email address, Reset your password and Accept the invitation become
buttons, one to an email.

- A table cell in the product's purple, `#5546B8`, holding the link in
  white, 7.1 : 1, at least 44 px tall (#170). The padding is on the link,
  with Outlook's own padding rule, so the whole button is clickable there
  too. Its corners are the app's control radius, square in Outlook, which
  draws no rounded corners without VML.
- Under each, the invitation's line, "If the button doesn't open, copy
  this address into your browser:", with the address, which breaks
  anywhere so a long link never widens a phone's column. It moves from
  `mail.invitation.fallback` to a shared id, its words unchanged in all
  three languages. In the HTML part only: the text part already gives the
  address on a line of its own.
- The security emails keep their two links inside the sentence, as
  ADR-037 wants: no one-click action in a security email, which is what
  phishing copies. Google's alerts have a button; this is a deliberate
  difference.
- The deletion notices keep the app's address written out as their link:
  they inform, and the actions they mention are in the app.

So every sentence an email shows is already translated; none is added in
English alone.

## Decision — dark mail apps

No colour is set on the page or the text,
so each mail app's own colours apply, its dark ones too. Only the
header's plate, the button and the rules have fixed colours, each chosen
to stand on light and dark. The grey becomes `#A3ACBA` under
`prefers-color-scheme: dark`, which Apple Mail honours, and under
Outlook.com's own selector for its dark mode. Gmail's app inverts colours
in its own way, and the check by hand looks at what it does.

## Decision — the inbox preview

A hidden preheader carries the email's
first sentence after its greeting, or its first sentence where it has
none, padded with invisible spacing so the preview ends there rather than
running on into the header. Without it every inbox shows "Panivo Hi Bob,"
first. Some screen readers read it before the email: an accepted trade,
for no new words. HTML only.

## Decision — the invitation answers to its inviter (amends ADR-077)

While the inviter is still a member, the invitation's `Reply-To` is their
address, as Google Docs' sharing emails do: a newcomer who replies, "which
warehouse do I start in?", reaches a person rather than `no-reply@`. The
address is already in the email, so the invitation can be told from a
forgery (ADR-077), and inviting needs it verified. Once the inviter has
gone, the invitation names only the organization and has no `Reply-To`. A
resend is written the same way. `Mail` gains an optional `replyTo`, which
MailService passes to Resend's API as `reply_to` and to nodemailer as
`replyTo`; no product email sets one.

## Decision — seeing every email at once

- `npm run mail:preview` in `server/` writes every email, in each
  language it is sent in, as HTML and text, into `tmp/mail-preview/` with
  an index page, from fixed contexts and with no database. `--send`
  delivers them all to Mailpit, and refuses when `RESEND_API_KEY` is set,
  so it never sends real mail.
- The client's Playwright draws each previewed email at 375 and 600 px,
  light and dark, where `npm run screenshots:compare` reads them, so the
  pull request shows each email before and after, as it shows the
  screens. No new dependency. A browser is not a mail app, so the check
  by hand stays.
- Mailpit's HTML Check scores each email against caniemail.com's data,
  mail app by mail app; the manual check reads it, in place of a paid
  rendering service.
- By hand on the live site, light and dark, images on and off: Apple Mail
  on a Mac and an iPhone, Gmail's app and web, Outlook.com, and QQ Mail's
  web view where there is an address to hand. A handful of emails, not all
  of them: Resend's free plan sends 100 a day.

## Decision — `/build-from-brief`, a project skill, rides along

`.claude/skills/build-from-brief/SKILL.md`, run as
`/build-from-brief tmp/adr-NNN/brief.md <step>`, in place of "Read
tmp/adr-NNN/brief.md and do step N. End with the summary for the chat."
It holds what every brief repeated: the author and committer; staging by
path after `git status`; one `-m` with the why; `scripts/verify.sh`,
`--quick` within a step and in full before a push; lint's reformatting
committed as a fixup, never restored; `npm run api` and both generated
files; migrations; the inventory step and the seeds step; the stop rule;
where `/clear` is safe; and the summary for the chat. A brief then holds
its decisions and its prompts.

- **One home per rule.** The skill links `docs/conventions.md` and the
  working agreements in `docs/engineering.md` rather than copying them, except the lines
  it must act on, so a rule changed once cannot disagree with itself.
- **The square logo's four lessons, as rules:** dependencies judged by
  each package's own publish time, never moving one back; a migration
  that adds to a list the code shares commits with that code; manual
  checks in the same commit as what they check; the review step in two
  prompts, the findings first, the fixes once Bob has chosen.
- **It runs only when a prompt names it,** never on Claude Code's own
  initiative.
- **Its summary has a fixed shape:** the commits with their hashes, what
  verify said, issues filed, follow-ups, and whether `/clear` is safe now.
- Built straight after the branch's dependencies, so the rest of the
  branch runs through it. CLAUDE.md names it, and the README lists the
  four project skills.

## Decision — the numbers after it

The error tracker is ADR-084, and low
stock moves from ADR-083 to ADR-085, as it moved for the brand on 24
October.

## Considered and not done

- **MJML, React Email, or templates in files.** A compiler, React on the
  server, or a second language beside TypeScript, for 14 emails whose
  words are in the catalogues.
- **Litmus or Email on Acid,** which render an email in about a hundred
  mail apps, for a monthly fee. Mailpit's HTML Check, the pictures and the
  list by hand do it until there are customers.
- **VML for rounded corners in Outlook on Windows.** Code only that one
  app reads, for corners.
- **An email in the app's chosen mode,** dark for someone who chose Dark.
  The mail app decides as the email is read, not as it is sent; one email
  is read on several devices, while the app's choice is kept per device;
  and Gmail's app inverts colours by itself, which would turn a dark email
  muddy or light. Light by default, switched by the mail app, is what
  follows each reader. The page an email's link opens already starts in
  that device's mode (ADR-082).
- **The organization's square logo in the invitation:** above.
- **The organization's accent on the invitation's button:** ADR-060's
  colour on emails, still deferred.
- **A footer on the product's emails** saying why it came, where replies
  go, and linking terms: new words, and nothing yet to link (Deferred).
- **One-click unsubscribe (`List-Unsubscribe`).** Gmail and Yahoo ask it
  of bulk and marketing mail; these are transactional.
- **Open and click tracking.** Off in Resend: a tracking pixel would break
  the test above, and click tracking rewrites every link, the sign-in and
  reset links included.

## Deferred — each with what brings it in

- **A footer for the product's emails,** with a reply address and links to
  the terms and privacy policy. Trigger: those documents (ADR-082), or a
  mailbox on the domain (`services.md`).
- **Links on the sending domain.** Trigger: Panivo's own domain, at the
  first customers (ADR-082).
- **A rendering service.** Trigger: the first paying customer, or an email
  reported looking wrong in a mail app the list does not cover.
- ADR-082's name by language in emails and mark in an organization's
  emails, and ADR-060's colour on emails, keep their triggers; with the
  layout, each is a change to one block.

## Consequences

- No migration, and no change to the API.
- Server: `shared/mail/`'s layout and its blocks; MailBrand drawing the
  header as a block; each of the six places building blocks;
  `Mail.replyTo`; the fallback line's shared id in the three catalogues;
  specs for the layout (escaping, both parts from one set of blocks,
  `lang` twice, the tables' role, the size, nothing loaded but the mark)
  and for each email's text part, unchanged.
- `npm run mail:preview` in `server/`, and the client's Playwright drawing
  the previews for `screenshots:compare`.
- `.claude/skills/build-from-brief/SKILL.md`; CLAUDE.md; the README's
  skills line, and a row in its "Which tool, when" for the preview.
- Seeds: nothing. Emails add no table, the demo sends none, and the
  preview builds every email without a database.
- Manual checks: MC-3503 rewritten (Mailpit, its HTML Check, the
  preheader); new checks for a button and its fallback line, a phone's
  width, dark mail apps, the live site's list, and a reply to an
  invitation reaching its inviter.
- Designed on the canvas before building: the confirm-email email on a
  computer and a phone, light and dark, images off; the invitation in
  English and 中文; a security email; a deletion notice. The brief and the
  boards go in `tmp/adr-083/`.
- Build order, a commit each, through `/build-from-brief`: this ADR;
  dependencies; the skill; an inventory of every email, with the
  preview's first run as the before; the layout and its tests; the
  product's emails moved onto it; the invitation, with its `Reply-To`;
  the pictures; dependencies again; the reviews, `/usability-walkthrough`
  as the novice bookkeeper opening an invitation on a phone in 中文, then
  `/simplify`, `/code-review` and `/production-readiness` on its email
  section; the docs last. Manual checks go in the commit whose change
  they check.
- The pull request is the first real one for #254's changes to Claude
  Code Review: its first run's time, models and any `Refused:` line are
  read against #253's table, without a re-run.

## Amendment (October 2026) — settled with the design

The canvas's
boards (Bob, 26 October 2026) settled six points and found one fault.

- **Dark mail apps take the app's own Dark accent** (the fault). The
  purple, `#5546B8`, reaches 2.35 : 1 on Apple Mail's dark background,
  where text needs 4.5 : 1, so the security emails' links, a deletion
  notice's address and the button's edge were hard to see. Under
  `prefers-color-scheme: dark`, and Outlook.com's own selector for it,
  links and the button take ADR-055's dark accent, the purple mixed 45%
  toward white, `#A299D8`: links 6.4 : 1, and the button `#A299D8` with
  dark text `#141A24`, 6.7 : 1, as the app's own buttons are in Dark.
  Gmail's app inverts colours its own way, and the check by hand looks
  at what it does.
- **Each product email opens with its subject as its heading,** under
  the header: words the email already has in every language, in the
  HTML part only. The invitation's heading, Join {organization}, already
  is one.
- **To a screen reader, an email is one article.** Its outermost element
  has `role="article"`, `aria-roledescription="email"` and its subject
  as `aria-label`, as the Email Markup Consortium advises, so a screen
  reader in webmail reads it as one email rather than running it into
  the page around it. Nothing shows on screen.
- **On a phone the button fills the column,** by a style rule for narrow
  screens; a mail app that drops the rule shows it at its usual width,
  which a computer keeps.
- **The address line comes last,** in small print after the email's
  other sentences and before an invitation's last line, rather than
  straight under the button: what to do is read first, the fallback
  after it.
- **The expiry sentence stays body text,** and the invitation's note sits
  in a thin box, not behind a coloured bar.
- **Manual checks gain** VoiceOver in Gmail on the web reading one email
  as an article, its heading first; the button the column's width on a
  phone; and the links and the button in Apple Mail's dark mode.

### Deferred, added

- **The brand's mark beside the sender's name in an inbox (BIMI).** It
  needs DMARC enforced, at `p=quarantine` or `reject`; Panivo's own
  sending domain, since BIMI attaches a mark to the domain mail comes
  from and `wide-naturals.ca` is Bob's own; and, for Gmail, a mark
  certificate paid for each year, one kind of which needs a registered
  trademark. Trigger: DMARC's, the first paying customer, with Panivo's
  own domain.

### Left for an issue

The security emails print their time as
`toUTCString()`, "Mon, 26 Oct 2026 22:41:07 GMT", hard to read and in
no reader's time zone: #255. Changing it changes the text part, which
this branch keeps, so it has a branch of its own.

## Amendment (October 2026) — as built (#257)

What building settled:

- **Corrections to the decisions above.**
  - The account's third deletion email is *blocked*, "your account could
    not be deleted", sent when something changed since the person asked
    (ADR-069), not *done*: nothing is emailed once an account is gone.
    The count stays 14.
  - The dark button's text is `#10141A`, the app's `ON_ACCENT.dark`,
    7.1 : 1, not `#141A24`; the button's corners are 6 px,
    `RADIUS.control`, not the boards' 8.
  - The preview line takes its source whole, never its first sentence:
    the button's words for confirm and reset, an invitation's lead, and
    the first paragraph after the greeting for the rest. Splitting
    sentences cut an inviter named "Dr. Wang" at "Dr.", and no rule for
    abbreviations fits every language and every name. A deletion
    notice's preview now shows its day too.
  - "No colour is set on the page or the text" holds in light mode only.
    Mailpit, like some mail apps, paints its own white page behind an
    email while honouring `color-scheme: light dark`, which turns the
    default text light: white on white. Under the dark rules, the email
    sets its own page and text, the app's `DARK.page` `#161A21` and
    `DARK.text` `#E6E9EF`, on `<html>`, `<body>` and its outermost
    element. Apple Mail's dark mode shows the app's dark grey rather
    than its own.
- **The layout,** `server/src/shared/mail/mail-layout.ts`: ten blocks and
  `writeMail()`, which writes both parts from one list. Spacing is
  padding on one table row per block, since Outlook ignores some
  margins; Outlook's font is a `<!--[if mso]>` style of its own; the main
  `<style>` holds only the dark and narrow-screen rules, Outlook.com's
  `[data-ogsc]` and `[data-ogsb]` among them. A block's text part is
  worded by one optional `plain` field: `null` leaves it out, a string
  words it differently. The details' labels never wrap, so 浏览器 stays
  whole on a phone. The note's border takes the rules' dark colour,
  `#3A3F48`, the emails' own value, since no token has it. The preheader
  is the body's first element, outside the article.
- **The product's emails.** `MailBrand.write` adds the header block and
  the subject as the heading, in the HTML part only, and `send` sends what
  it writes, so no product email can leave either out. The greeting block
  takes the reader's name, and the layout says Hi in the email's
  language. Confirm and reset are one builder, `core/auth/account-mail.ts`,
  given their path and their words, moved out of `AuthService` unchanged
  in a commit of their own. A link inside a translated sentence, the
  security emails' two, is placed by one helper, `translateParts` in
  `i18n/translate.ts`, so each language keeps its own word order.
- **The address under a button** is its own link, in the small print's
  grey. It breaks after any `/`, `?`, `=` and `&` by `<wbr>`, which is
  not copied, as well as by `word-break`, which about a third of mail apps
  ignore. It goes in before an email's first footer, and no block moves,
  so both parts keep one order.
- **The invitation.** `MailContent` is `Mail`'s envelope with blocks, so
  `replyTo` passes through `writeMail`; `MailService` gives it to Resend
  as `reply_to` and to nodemailer as `replyTo`. It is set while the
  inviter is still a member, on a send and a resend alike, and is absent
  once they have gone. `mail.invitation.fallback` became
  `mail.button.fallback`, its words unchanged.
- **The proof.** `server/src/cli/mail/` holds 40 samples, every email in
  each language it is sent in, built with the real builders and no
  database, and each sample's text part in `__text__/`, written from the
  code before the layout and never rewritten since; `mail-samples.spec.ts`
  compares them on every run. `npm run mail:text` runs the proof alone,
  and `npm run mail:text -- --update` rewrites the files, for a branch
  that changes an email's words on purpose (#255, a translation
  corrected), in a commit that changes nothing else; a change of layout
  or code fixes the code, never the files (conventions.md, "Tests"). The
  samples sit beside their only user, `cli/mail-preview.ts`, since
  `shared/` imports nothing from `core/`.
- **The tools.** `npm run mail:preview` writes `tmp/mail-preview/`, a
  byte-order mark before each text part; `-- --send` refuses when
  `RESEND_API_KEY` is set, and every sample goes to an `@example.com`
  address. `npm run screenshots:mail` in `client/` draws a preview folder
  at 375 and 600 px, light and dark, named as `screenshots:compare` reads
  them, the mark from `client/public/` with no server running; a run
  takes about 7 seconds. A comparison copies today's preview to a folder
  of its own, since `mail:preview` empties its folder each run.
- **The colours.** `common/dark-accent.ts` holds `darkAccent()` and
  `ON_DARK_ACCENT`, used by organizations' accents and the emails alike;
  `tokens.ts` names each value the emails keep a copy of, `DARK.page`,
  `DARK.text`, `ON_ACCENT.light` and `RADIUS.panel` among them. No test
  reads the client.
- **Tests.** Escaping; both parts from one set of blocks; `lang` twice;
  every layout table's role; the article's three attributes; the dark
  rules, the page and text colours under both selectors and none in light
  mode; the preheader first; the button at least 44 px, in Outlook too;
  buttons on confirm, reset and the invitation only; and under 50 KB with
  nothing loaded but the mark, against all 40 samples. The header's tests
  compare MailBrand's blocks (`opening(subject)`), and the layout's spec
  alone pins markup. Mailpit's HTML Check scores the emails about 89 to
  93 % supported, every warning one of the extras above or a margin reset
  to zero.
- **Riders.** `.env.example` leaves `RESEND_API_KEY` commented out, so a
  copied `.env` sends to Mailpit. CodeQL found a spec escaping only the
  first `&` of the address it expected.
- **The reviews,** numbered in `tmp/adr-083/review.md`: 19 fixed. Left:
  Panivo in the email and 品桥 on the page its button opens, evidence for
  ADR-082's deferred name by language in emails, for Bob's mother's
  review to confirm; an organization on UTC named as "GMT+00:00（UTC）"
  in an expiry, a comment on #255; and `screenshots:mail` loading each
  email four times (below).
- **Considered and not done, added:** `screenshots:mail` drawing both
  widths at once and switching mode without a reload, which would save
  about 3 seconds of 7. Trigger: a run over a minute.
- **Claude Code Review's first run after #254** (run 40458807349) took
  28.9 seconds in 8 turns, Sonnet alone, with two Bash commands refused
  for chaining an allowed `gh pr diff` with `cd`, `grep`, `tail` or a
  redirect. The allowed list parsed into eight clean entries, so not its
  commas: the multi-agent review does not run on a first attempt either
  (#253, commented).
- **Left for an issue:** the token lifetimes, #258. The confirm and reset
  emails say 24 hours and one hour, while `VERIFICATION_TOKEN_TTL_MS` and
  `PASSWORD_RESET_TOKEN_TTL_MS` are settings; set to anything else, the
  emails would name the wrong time.

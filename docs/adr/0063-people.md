---
status: accepted
date: 2026-10-09
amended-by: [ADR-079]
---

# ADR-063 — People: a photo of one's own, initials otherwise, and a People page

**Context.** A person shows as an icon in the top bar and as a name
everywhere else: in Members, in a record's history, as who uploaded a
photo or released a run. In a team of any size, names alone are slow:
people know each other's faces before their surnames, and a new hire
knows neither. Some will never upload a photo, so the app has to look
right without one too.

What shapes it:

- **A face belongs to its person.** Someone in two organizations has one
  face. ADR-059 files every file under an organization; a photo is not one
  organization's.
- **It is personal data**, of a kind the app holds nowhere else. The
  person decides whether it is there.

**Decision — only the person sets their photo.** On the Account page, in
the Profile card beside their name, email and language: Add a photo,
Replace, Remove. Nobody else can, an owner included: putting
a person's face in the app is theirs to do. Removing it deletes it at
once, bytes and all, rather than releasing it for 30 days as ADR-059 does
for organization files: there is no undo for a face someone took back.

**Decision — stored with the person, through ADR-059.**

- `files` gains `user_id`: a file belongs to an organization or, for a
  photo, to a person, never both. The key is the owner's id and the
  file's, `<user id>/<file id>/<size>`, the same shape. A photo counts
  against no organization's limit.
- A new kind, `avatar`: PNG, JPEG or WebP, up to 5 MB, re-encoded without
  metadata (ADR-059), **cropped square from the centre**, unlike product
  photos, since a face is always shown in a circle: `thumb` 128 px for the
  small circles, `full` 512 px for the People page and the Account page.
- `users.photo_file_id`, null for none. A new photo replaces the old,
  which is deleted.

**Decision — seen by the people one works with.** `GET
/v1/people/:userId/photo?size=` answers for a person who shares the
caller's current organization, and is a 404 for anyone else, as for any
record. The address carries the photo's id, so a new photo is a new
address and every browser picks it up; each is cached for a year
(ADR-059).

**Decision — initials, never a blank.** Without a photo, a person is
their initials (two letters from the name, or the first two of an email)
on a colour taken from the name: always the same colour for the same
person, from eight that read white text at AA in both colour modes, so
two people with the same initials still look different.

**Decision — the same face everywhere a person appears.** One component,
one circle, in: the top bar's account button, the account menu, the
Account page, Members, the People page, and each entry of a record's
history. Notifications, recently opened and the lookup keep their names
alone for now (Deferred).

**Decision — details at work, set by the person, per organization.** Job
title, department, location, work phone and extension, each optional,
each set by the person on the Account page under "Your details at"
and the organization's name. On the membership, not the account: someone in two
organizations has a title and an extension in each. Nobody else edits
them, as nobody else sets the photo.

**Decision — a People page for finding someone, a page per person for
everything else.**

- `/people`, in the menu for every member: a card each, with what is
  looked up most: the face, name, job title, role and work phone with its
  extension. Searchable by name, title, department and email; sorted by
  name.
- `/people/:userId`, opened from a card or from a face anywhere: the large
  photo, name, title, role, and only the details the person has filled in
  (department, location, work phone and extension, email, member since),
  never a row of dashes. With none filled in, one line says so. Then, for
  those with `audit.view`, the last 20 things they did in this
  organization, newest first, each linking to its record, and only to
  records the viewer may open. Nobody else sees that section, and a
  person's own page does not show it either: their own work is on their
  Account page. Twenty is a preview, not a limit: "See all of
  their activity" opens the audit log filtered to them, with its dates, its Load
  more and its CSV export (ADR-057), which already hold everything.
- **Last active** is when the person last did something in this
  organization (below). Everyone sees it coarse: active today, this week,
  this month, over a month ago, never signed in. Those with `audit.view`
  see the time to the minute, and to the second on hover; the history
  keeps the rest.
- **Long values never break the layout.** On cards, a name wraps to two
  lines and a title, phone or email to one, each whole on hover and on the
  person's page.
- Read-only. Adding and removing people, and their roles, stay in Members,
  for those who may.

**Decision — last active is what the person did, not what their tab did.**
Three things that sound alike are kept apart:

| Term | What it means | Where it comes from | Shown |
| --- | --- | --- | --- |
| Last active | When the person last did something here | `memberships.last_active_at`, new | People cards, a person's page |
| Signed in | When a device signed in | `sessions.created_at`; every sign-in in `account_events` (ADR-022) | Your devices; the Account page's sign-in card |
| Session alive | Whether that sign-in still holds | `sessions.last_seen_at`, against the idle and absolute limits | Nowhere: it is security's |

- `last_active_at` is on the membership, so someone in two organizations
  is active in the one they used. Any request the person makes moves it,
  at most once a minute, except a background one.
- **Background requests say so.** The notification bell's count, polled
  every minute, sends `X-Background: 1`, and the server lets such a
  request move neither last active nor the session's idle timer. A tab
  left open at six in the evening shows its owner as active yesterday the
  next morning, not active now; and an untouched tab signs out when the
  idle limit passes, which is what that limit is for. The bell also stops
  polling while its tab is hidden.
- The limits stay seven days idle and thirty days in all: long, as B2B
  tools' are. A short idle limit with a warning, for shared warehouse
  computers, is an organization's setting to decide later (Open
  decisions).
- What the three sources show, the audit log (ADR-018) and account events
  (ADR-022) keep their own rules; this ADR only reads them. A person's
  page and Your activity read `audit_log`; the Account page's sign-in card
  reads `account_events`. Your activity is its own route,
  `/v1/account/activity`, calling the audit log's service with the person
  set by the server to the caller, rather than `/v1/audit` trusting a
  filter the browser sends to decide who may see what.

**Decision — the top bar shows the face alone.** At every width, as most
apps do: no email beside it. The email was there so that on a shared
computer people could see whose account is signed in; a face, or initials
on their own colour, says that at a glance. Hovering shows the name and
email; the account menu opens with both.

**Decision — your own work on your Account page, and what others see,
said plainly.** The Account page gains "Your recent work in"
the organization: the last 20 things you did there, each linking to its
record, titled apart from the sign-in activity it already shows. "See all
your work" opens Your activity, `/account/activity`: the audit log's list,
dates, Load more and CSV export, held to your own actions, so anyone can
read and export all they did without `audit.view`. Exports are CSV, as
every list's (ADR-057); JSON is for programs, and waits for an
integration that asks. And one line under the photo says who sees
what: colleagues see roughly when you were last active; those who may read the history also see the exact time
and your recent work.

**Consequences.**

- Built in this order, one PR: the screens on the Claude Design canvas,
  reviewed first; migration 0052 (`files.user_id`, the `avatar` kind,
  `users.photo_file_id`, the membership's work details and
  `last_active_at`); the server
  (upload, remove, serve, the details, people and a person); the client
  (the circle, the Account page, the top bar, Members, history, the
  People page, a person's page); manual checks.
- Deleting an account deletes its photo with it.

*Amended while building:*

- **"Deleted at once" is the app's storage.** The nightly copy of the
  files bucket (ADR-059) keeps a removed photo until that copy expires,
  31 days on, as it keeps everything; nothing restores it into the app.
- **A photo change is an account event** (`account.profile_updated`,
  ADR-022), not an audit entry: it is the person's own, like their name.
  Changing your details at work is neither, as a self-action on your own
  membership.
- **Members gains the face and last active,** as People shows it: roughly
  for everyone, to the minute for those who may read the history. First
  built with the face alone; seeing the page, its last active was wanted
  where people are managed too.
- **Who and when, both ways.** The audit log, Your activity and a record's
  History show the person's name with their email beneath it, cut short
  when long and whole on hover, and the time to the minute with how long
  ago beside it.
- **Your activity is the audit log's page** in a mode of its own: the
  person set by the server, no action filter (the log's vocabulary is
  for those who may read it), its own export. An owner's "See all of
  their activity" opens the audit log with a person filter it now shows
  as a notice, like a record filter.
- **The bell's background mark** is `X-Background: 1`, and it polls only
  while its tab is visible, asking at once when it is seen again.

*Amended (October 2026): initials by the name's script.* Two letters from
the name read as initials only in a script with capitals. 周振中 showed
周振, the surname and half the given name, which no reader of Chinese
would write, and a name with no space was cut the same way in any script.
Initials now follow what readers of the name's own script expect, as
production apps do:

- **Chinese:** the last two characters, the given name, which is what
  colleagues call each other and what Chinese workplace apps show; a name
  of two characters whole. A compound surname reads right (欧阳娜娜 gives
  娜娜); a two-character surname with a one-character given name does not
  (司马光 gives 马光), which only a separate surname field could fix.
- **Latin, Greek and Cyrillic:** the first and last names' initials, as
  before, now taken by grapheme, so an accent typed as a code point of its
  own stays on its letter, and skipping emoji and brackets. A mixed name
  takes only its words in these scripts (Zhou 振中 gives ZH).
- **Any other script:** its first character, as Google's apps show every
  name. Never wrong where the app does not know the custom. Fluent UI's
  choice, a generic icon for scripts it does not handle, was not taken: a
  team of Arabic names would all look the same.

Names in kanji are read as Chinese, since the characters cannot tell the
two apart; Japanese is not one of the app's languages. Two Chinese
characters are set at 0.32 of the circle rather than 0.4, being about
twice as wide, and are marked `lang="zh"` wherever the circle is read as
text (People, a person's page, Members, History, the account menu), so a
screen reader on an English page reads them in a Chinese voice. Colours
are unchanged: a name keeps its colour.

The top bar's account button is the one exception. Its name is a single
label, "{initials}, signed in as {email}", and an accessible name is one
string: no screen reader is given the language of a part of it. Marking
the whole button Chinese would read "signed in as" in a Chinese voice, so
there the initials follow the page's language, as any label mixing two
languages does. In the Chinese app the page is Chinese and they are read
as Chinese anyway.

**Considered and not done.**

- **An owner adding a photo for someone.** Faster for staff who never
  will, and a face in the app the person did not put there. Initials
  carry them well enough.
- **A gravatar or a photo from a sign-in provider.** A third party asked
  about every member's email, for a picture that is often years old.
- **A photo per organization.** One face, wherever the person works.

**Deferred — each with what brings it in.**

- **Faces in notifications, recently opened and the lookup.** Trigger:
  the first of them that reads slowly with names alone.
- **"Online now", live.** A green dot needs a live connection to every
  open tab, as chat apps keep. Trigger: a reason to know who is there this
  second rather than today.
- **A manager, a mobile number, working hours.** An HR directory's, not
  a team's. Trigger: a team large enough to ask for an organization chart.
- **Korean names by their given name.** Hangul's custom is Chinese's, the
  given name's two syllables; today a Korean name shows its surname's, and
  most of a Korean team would share one. Trigger: Korean as one of the
  app's languages, or a team that asks.

**Amendment (October 2026) — who is new (ADR-079).** People marks a member
who joined in the last two weeks, with the day they joined, and its
summary line says how many did.

---
status: accepted
date: 2026-10-08
amended-by: [ADR-070]
---

# ADR-059 — Files: one store for every file, on R2, served through the app

> **Amended by [ADR-070](0070-deleting-an-organization.md).**
> A deleted organization's files are erased when its deletion completes, not released to wait 30 days: the 30 days came before it, and their rows go with the organization.
> Its October 2026 amendment (#117) changes how every upload writes: the bytes go to storage first, under an id taken beforehand, then a short transaction saves the row, and an upload that is refused or fails deletes its bytes. A deletion run's mark then refuses any upload after it.

## Context

Nothing stores a file yet, and several things are waiting to.
Branding needs the organization's logo (*Open decisions*, ADR-055's brand
tokens). The catalogue wants product images. Lots want their certificates
of analysis, licences their documents (ADR-040), purchases their supplier
documents, returns their photos. Each has pointed at "the bucket question"
until one decision answers it for all of them.

What shapes the answer:

- **Tenancy.** Every row carries `organization_id`, and every read goes
  through the tenant's scope (ADR-003). A file is data like any row, and no
  organization may ever read another's.
- **Mainland China.** Some users are there. Browsers reaching a storage
  provider's own hostname may be slow or blocked; the app's own domain
  already works.
- **Backups.** ADR-053 keeps the database's nightly dumps in Cloudflare R2,
  bucket `waf-backups`, with a bucket lock and lifecycle rules. R2 has no
  object versioning and no S3 object lock; its own bucket locks do the
  same job by prefix.
- **Scale.** A few organizations, files counted in hundreds. R2's free
  allowance is 10 GB-month of storage, 1 million writes and 10 million reads
  a month, and it charges nothing for egress.
- **Uploads are hostile until checked.** A file named `logo.png` can be
  anything. An SVG can carry script. A photo carries its GPS position.

## Decision — one store for every file: Cloudflare R2, its own bucket

- Bucket `waf-files`, in the location nearest the app's host (amended
  below). One bucket for every kind of file and every organization; the
  database, not the bucket, knows whose a file is.
- Its own API token, scoped to `waf-files` with read and write, held only
  by the app. Backups never share a bucket or keys with it, in either
  direction: the app cannot touch a backup, and the backup job's key for
  files is read-only.
- Reached through the S3 API, so the provider is a setting: another S3
  store is a new endpoint and keys, as for backups.

| Variable | Holds |
| --- | --- |
| `FILE_STORAGE` | `s3` in production, `local` in development and tests |
| `FILES_S3_ENDPOINT`, `FILES_S3_REGION`, `FILES_BUCKET` | Where files go (`auto` is R2's region) |
| `FILES_S3_ACCESS_KEY_ID`, `FILES_S3_SECRET_ACCESS_KEY` | The app's key for `waf-files` |
| `FILES_LOCAL_DIR` | Where `local` keeps files, `server/storage/` by default, ignored by git |

`local` writes to disk behind the same interface, so development, unit
tests, e2e and CI need no bucket and no network. The S3 driver is the one
production uses; a manual check covers it against R2 (*Consequences*).

## Decision — a `files` table is the record; the bucket holds bytes

- One row per file: `id` (UUIDv7), `organization_id`, `kind` (`logo`,
  `product_image`, `document`, `return_photo`; each user of files adds its
  own), `content_type`, `size`, `sha256`, `original_name`, `width` and
  `height` for images, `created_by`, `created_at`, `released_at`. Read
  and written through the tenant's scope like every tenant table.
- The object's key is `<organization id>/<file id>`: no name, no
  extension, nothing a person typed. The name a person gave is in the row,
  cleaned, and used only as the download's file name.
- **A file never changes.** A new logo is a new file, the old one released.
  So an object is written once and never overwritten, which is what lets a
  file be cached forever and backed up by copying what is new.
- The record that uses a file holds its id: `organizations.logo_file_id`,
  later a product's images, a lot's certificates. Each feature's own ADR
  adds its column or link table, with its permission and its rules (a
  certificate on a shipped lot cannot be removed, for instance).

## Decision — uploads go through the app, and are checked before they are kept

`POST /v1/files` with the file and its kind, as `multipart/form-data`. The
server checks, in order, and stores only what passes:

1. **Permission for the kind**, the permission of what it is for:
   `organizations.update` for a logo, the catalogue's for a product image,
   and so on. A file nobody may attach is refused before it is read.
2. **Size while it arrives.** The limit is enforced on the stream, so an
   oversize upload is cut off at the limit, not read to the end and then
   refused.
3. **Type from its bytes**, never from its name or the browser's word: PNG,
   JPEG, WebP, PDF and, for logos only, SVG, each recognised by its
   signature. Anything else is refused with what is accepted.
4. **Images are decoded and written again** (`sharp`): colour as sRGB,
   every piece of metadata dropped (EXIF, GPS, camera), turned upright from
   the camera's orientation, stored as WebP or, for logos, PNG, in the
   sizes below. A file that does not decode as the image it claims to be is
   refused. Re-encoding is also what defeats a file that is an image and
   something else at once.
5. **An SVG logo is drawn to a PNG on the server** and only the PNG kept.
   The SVG itself is never stored or served, so nothing it contains can run.
6. **A PDF is kept as it is**, after its signature, and only ever served as
   a download (below).

| Kind | Accepted | Largest upload | Kept as |
| --- | --- | --- | --- |
| `logo` | PNG, JPEG, WebP, SVG | 2 MB | PNG, at most 1024 px wide, at least 256 px wide accepted |
| `product_image` | PNG, JPEG, WebP | 20 MB | WebP in three sizes (below) |
| `return_photo` | PNG, JPEG, WebP | 20 MB | WebP in three sizes (below) |
| `document` | PDF, PNG, JPEG | 20 MB | PDF as uploaded, images as WebP in three sizes |

## Three sizes of every photo, made once at upload

A list or a gallery
strip shows many small images, a product page one clear one, and zooming
in wants every detail the camera caught. One size cannot serve all three:
a full photo in a list of fifty is megabytes for fifty squares, and a
thumbnail zoomed in is a blur.

| Size | Long side | Quality | About | Shown |
| --- | --- | --- | --- | --- |
| `thumb` | 400 px | WebP 75 | 20–40 KB | Lists, cards, a gallery's strip (200 px on screen, sharp on a 2× display) |
| `display` | 1200 px | WebP 80 | 100–250 KB | The image on a record's own page, the main picture of a gallery |
| `full` | 3000 px | WebP 85 | 0.5–1.5 MB | Opened to zoom in, and downloaded |

- Each size keeps the photo's own proportions; nothing is cropped on the
  server. A square in a list is the page's `object-fit`, so no edge of a
  product is lost for good.
- Never enlarged: a photo smaller than a size is kept at its own size for
  that one.
- One `files` row; one object per size, `<organization id>/<file id>/thumb`,
  `/display`, `/full`. The row keeps each size's width and height, so a
  page reserves the space before the image arrives and nothing jumps.
- The client asks for the size it shows: a list `?size=thumb` with
  `loading="lazy"`; a record's page `srcset` over all three with `sizes`, so
  the browser picks by screen width and pixel density; the zoom view
  `?size=full`. Zooming in the viewer is the browser scaling the full
  image.
- Sizes are made once, when the photo arrives, never per request: a page
  of thumbnails costs reads, not resizing.

A new file is unattached until the record that uses it is saved with its
id. Unattached files older than a day are released, so an abandoned form
leaves nothing behind.

## Decision — every file is served through the app's own domain

`GET /v1/files/:id`, and `?size=thumb`, `display` or `full` for a photo
(full without one), after sign-in, the tenant's scope (another
organization's file is a 404, as for any record) and the permission of what
uses it: whoever may see the product may see its image. The server streams
the bytes from the bucket.

- **Never a provider URL, never a signed redirect.** A browser in China
  only ever reaches the app's domain, a link cannot outlive or escape the
  permission check, and moving provider changes no URL anywhere.
- Headers: the stored `Content-Type`, `X-Content-Type-Options: nosniff`, and
  `Content-Disposition: attachment` with the cleaned name for everything
  except the images the server itself wrote, which are `inline`. A PDF is a
  download, never a page of the app's own origin.
- `Cache-Control: private, max-age=31536000, immutable` and the `sha256` as
  the ETag: a file never changes, so a browser keeps it until it is gone.
- Printed documents (invoices, packing slips) read the logo from storage on
  the server; nothing printed fetches a URL.

R2 charges nothing for egress; the app's host carries the bytes twice
(bucket to server, server to browser), which at these sizes is nothing. A
CDN or Cloudflare Images in front comes with the trigger below.

## Decision — released, then purged after 30 days

Releasing a file (its
record deleted, a logo replaced, an unattached upload expired) sets
`released_at`. A daily job deletes the bytes and the row 30 days later.
The window means a mistake can be undone and a database restored from last
week still finds its files. Deleting an organization releases all of its
files.

## Decision — files are backed up by copying, to the backup bucket

Files
never change, so a backup is a copy of every object the backup does not
yet hold.

- The nightly backup job (ADR-053) copies `waf-files` into `waf-backups`
  under `files/`, adding what is new and deleting nothing, with a read-only
  key for `waf-files`.
- A bucket lock on `files/` for 30 days, as on `production/`: nothing there
  can be deleted or overwritten in that time, by anyone.
- A lifecycle rule ends each copy after 31 days, and the next night's copy
  writes again whatever is still live. So every live file always has a
  copy, and a purged one survives in the backup for a month, matching the
  database's daily dumps.
- The restore runbook gains a step: after the database, copy `files/` back
  into a bucket, and check that every `files` row's object exists. The
  monthly drill checks the same against the backup.
- Files and their backups are both at Cloudflare. ADR-053 put backups at
  another provider than the database host; that holds. A second provider
  for the files' copy waits for the trigger below.

## Decision — a limit per organization

1 GB each, summed from `files`
over every size kept, so the free 10 GB serves ten organizations before
anyone pays; a photo in its three sizes is about 1 MB, so a thousand
photos each. Over it, an
upload is refused with how much is used and what can be released. A
setting, so a plan can raise it.

## Consequences

- Built in this order, each its own commit:
    1. By hand: bucket `waf-files` (Eastern North America), its token, the
       `FILES_*` variables on Render; the read-only files key for the
       backup job in GitHub; the `files/` lock and lifecycle rule on
       `waf-backups`.
    2. Migration 0049, `files`, scoped by organization like every tenant
       table.
    3. The storage module: the `local` and `s3` drivers behind one
       interface (`@aws-sdk/client-s3`), the checks and `sharp` with the
       three sizes, `POST /v1/files` and `GET /v1/files/:id`, the daily
       release-and-purge job.
       Tests on `local`; one manual check uploads, reads and purges against
       R2 itself.
    4. The backup job's copy, the runbook's step, the drill's check.
    5. The first user: branding's logo, in its own ADR.
- Two dependencies: `@aws-sdk/client-s3`, and `sharp`, which ships native
  binaries for the platforms used (Linux x64 on Render and CI, macOS ARM64
  for development).
- Files hold personal data: a return photo can show a person, a document a
  signature. They follow the same retention as the database: purged 30
  days after release, gone from backups a month later. The privacy policy
  says so, as it does for backups.
- No virus scanning. Images are rewritten and PDFs only downloaded, and
  every file comes from a signed-in member of the same organization.
  Trigger below.

*Amended while building:*

- **One upload route per kind**, `POST /v1/files/logo` and
  `/v1/files/product-image`, not one route with the kind as a field. The
  size limit is enforced while the upload arrives, and the permission
  checked before it does; both depend on the kind, which a route knows
  before a byte is read and a form field does not. Each feature that keeps
  files adds its route, its kind and a migration for `files_kind_check`;
  `logo` and `product_image` are the first two.
- **The purge runs hourly inside the server**, not as a scheduled job
  elsewhere: a server that sleeps when idle purges whenever it wakes, and
  two instances purging at once only delete the same things twice. Not in
  tests, which call it with the time they need.

  *Amended (October 2026):* at startup too, on the one timer the licence
  reminders (ADR-064) and account deletions (ADR-069) run on. The server
  sleeps after 15 minutes without a request, so an hourly timer alone
  never fires on a server woken for less than an hour at a time. A run
  at startup takes only what an hourly one would.
- **Over the organization's limit is a 409**, saying the limit in MB; an
  upload over its kind's size is a 413, cut off on the stream.
- **The bucket's location follows the app's host, not the backups'.**
  Every file passes through the server, so `waf-files` sits in the region
  nearest it; `waf-backups` is placed for its own reasons (ADR-053).
- **Deleting an organization deletes its `files` rows** (the foreign key
  cascades). Nothing deletes an organization today; when something does,
  it releases the organization's files first, as the decision above says,
  so the purge removes their bytes.

## Considered and not done

- **The logo in the database** (`bytea`, at most 500 KB). It needs no
  bucket, and works for one small logo; but product images and documents
  would need the bucket anyway, and two ways to store a file means two
  sets of checks, two backups and two ways to serve.
- **Uploads straight to the bucket with a signed URL.** It saves the app
  carrying the bytes, but the browser would then reach the provider's
  hostname (China), the bucket would need CORS, and the file would be
  stored before the server had checked it.
- **A public bucket or a custom domain on R2** for serving. No permission
  check, and a URL that lasts as long as the bucket.
- **MinIO in development** instead of a local driver. Another container,
  and its community edition has been cut back; `local` behind the same
  interface tests everything but the network.
- **Keeping the original beside the re-encoded image.** It would keep the
  metadata the re-encode exists to remove. `full` at 3000 px is what zoom
  needs; a camera's 4000 px and up adds bytes nobody looks at.
- **Resizing on request**, any width the page asks for. Every view would
  cost the server a resize, and every width a cache entry. Three fixed
  sizes, made once, cover a list, a page and zoom.
- **Cropping thumbnails square on the server.** A product's edge cut off
  stays cut off; a square is the page's choice, made with `object-fit`.

## Deferred — each with what brings it in

- **A CDN or Cloudflare Images**, for serving nearer the reader. Trigger:
  product images on a page anyone outside the organization sees, or image
  requests showing in the perf run.
- **AVIF beside WebP**, a third smaller again. Trigger: images a large part
  of what pages download.
- **Virus scanning** (ClamAV or a provider's). Trigger: files shared with
  people outside the organization, such as a customer portal, or a
  customer's security questionnaire.
- **A second provider for the files' backup.** Trigger: the first paying
  customer, or a contract that names one.
- **Per-organization limits by plan.** Trigger: plans.

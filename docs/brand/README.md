# Panivo's mark

The masters of the product's mark, a P: a navy stem and a purple bowl. They
are kept here, under version control, and never served: what browsers and
mail apps load is the files in `client/public/`, which
`scripts/brand-assets.mjs` makes from them. A change to the mark is made
here first, then the script is run.

## The masters

Each is drawn on a 100 × 100 viewBox, except the link preview's picture.

- **`panivo-mark.svg`**: the mark on light, stem `#1C2230` and bowl
  `#5546B8`, with no background.
- **`panivo-mark-on-dark.svg`**: the mark on `#1C2230`, the stem white and
  the bowl lightened to `#776BC6`, 3.6:1 against it.
- **`panivo-mark-on-dark-brand-purple.svg`**: the same with the bowl in the
  brand's `#5546B8`, 2.2:1 against `#1C2230`: under the 3:1 a graphic needs
  (WCAG 1.4.11), which is why the one above lightens it.
- **`panivo-plate.svg`**: the mark on dark at 70% on a navy plate, its
  corners rounded at 22% of its side: the one icon wherever the browser,
  the system or a mail app paints the background, and never switching
  (ADR-082).
- **`panivo-app-icon-dark.svg`**: the same on a square plate, for an
  iPhone, which rounds the corners itself.
- **`panivo-app-icon-maskable.svg`**: the square plate with the mark at
  60%, well inside the circle of 80% of the side that Android's mask always
  keeps (the safe zone), whatever shape the phone cuts.
- **`panivo-link-preview.svg`**: the picture a shared link's card shows,
  1200 × 630: the mark on dark and "Panivo" in white, "品桥" under it in
  `#A29BD3`, on `#1C2230`. The names are outlines, not text, so it draws
  the same anywhere; see below.
- **`panivo-favicon.svg`**: the first two in one file, switching with the
  system's dark mode, the tab's icon until ADR-082. The system's mode need
  not be the tab strip's (MC-3501, 24 October 2026), so nothing uses it now.
- **`panivo-app-icon-light.svg`**: the mark at 70% on a white square, an
  iPhone's home-screen icon until ADR-082. Nothing uses it now.

## The files made from them

| `client/public/`        | Master                         | Size           | Where it shows                                   |
| ----------------------- | ------------------------------ | -------------- | ------------------------------------------------ |
| `favicon.svg`           | `panivo-plate.svg`             | a copy         | the tab, wherever a browser draws an SVG icon    |
| `favicon.ico`           | `panivo-plate.svg`             | 16, 32, 48 px  | a browser that cannot, and Windows' taskbar      |
| `apple-touch-icon.png`  | `panivo-app-icon-dark.svg`     | 180 px         | an iPhone's home screen                          |
| `icon-192.png`          | `panivo-plate.svg`             | 192 px         | the web manifest's icon                          |
| `icon-512.png`          | `panivo-plate.svg`             | 512 px         | the web manifest's icon                          |
| `icon-maskable-512.png` | `panivo-app-icon-maskable.svg` | 512 px         | the web manifest's maskable icon, for Android    |
| `og-image.png`          | `panivo-link-preview.svg`      | 1200 × 630 px  | a shared link's card                             |
| `brand/mail-mark.png`   | `panivo-plate.svg`             | 56 px          | the product's emails, drawn at 28 px             |

Each PNG is drawn at its own size from the SVG. The ICO holds its three
sizes as PNGs, written by the script itself.

If the mail mark ever changes, give its file a new name, in
`scripts/brand-assets.mjs` and in `server/src/shared/mail/mail-brand.ts`,
rather than drawing over `brand/mail-mark.png`: mail apps keep copies of
the images they have fetched, so the old name would go on showing the old
mark. The server shows the new one once the static site serves it.

## Making them

```bash
(cd server && npm install)    # the script uses the server's sharp
node scripts/brand-assets.mjs
```

Commit the masters and what the script wrote together. Its tests, run by
`node --test scripts/` (and so by `scripts/verify.sh` and CI), check that
each file is there at its size. Browsers keep an icon long after it
changes, so look at a new one in a private window (MC-3501).

## The names in the link preview

The names in `panivo-link-preview.svg` were made outlines once, on 24
October 2026, from two fonts under the SIL Open Font License 1.1, which
allows their outlines in an image:

- **Panivo**: Source Sans 3 Bold (weight 700), 88 px, white.
- **品桥**: Noto Sans SC Regular (weight 400), 44 px, `#A29BD3`.

Both came from Google Fonts' repository, `ofl/sourcesans3/` and
`ofl/notosanssc/`, as variable fonts set to those weights. A one-off script
in a temporary folder shaped each name with HarfBuzz and wrote it as one
path with fontTools' SVG pen, where Chromium placed them when it laid out
the canvas's board `Brand-link-preview` at full size: the mark 128 px
square at (387.64, 204.5), Panivo from x 547.64 on a baseline at y 295.5,
品桥 from x 556 on a baseline at y 407.5. Neither the fonts nor the script
are in the repository. To make them again, shape the names the same way at
those places and replace the two text paths.

The product's name is a setting, not a file here: `VITE_APP_NAME`
(`docs/runbooks/render.md`).

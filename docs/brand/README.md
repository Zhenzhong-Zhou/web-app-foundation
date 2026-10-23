# Panivo's mark

The masters of the product's mark, a P: a navy stem and a purple bowl, each
file drawn on a 100 × 100 viewBox. They are kept here, under version
control, and never served: what browsers load is the three files in
`client/public/`, made from them. A change to the mark is made here first,
then those three are exported again.

- **`panivo-mark.svg`**: the mark on light, stem `#1C2230` and bowl
  `#5546B8`, with no background.
- **`panivo-mark-on-dark.svg`**: the mark on `#1C2230`, the stem white and
  the bowl lightened to `#776BC6`, 3.6:1 against it.
- **`panivo-mark-on-dark-brand-purple.svg`**: the same with the bowl in the
  brand's `#5546B8`, 2.2:1 against `#1C2230`: under the 3:1 a graphic needs
  (WCAG 1.4.11), which is why the one above lightens it.
- **`panivo-favicon.svg`**: the first two in one file, switching with the
  system's dark mode. `client/public/favicon.svg` is a copy of it.
- **`panivo-app-icon-light.svg`**: the mark at 70% on a white square.
  `client/public/apple-touch-icon.png`, an iPhone's home-screen icon, is
  this at 180 px.
- **`panivo-app-icon-dark.svg`**: the same on `#1C2230`. Nothing uses it
  yet.

`client/public/favicon.ico` is `panivo-mark.svg` at 16, 32 and 48 px, for
a browser that cannot draw the SVG. `client/index.html` links all three.

The product's name is a setting, not a file here: `VITE_APP_NAME`
(`docs/runbooks/render.md`).

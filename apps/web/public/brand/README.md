# LilTech 2026 — Official Brand Assets Directory

This folder is the single injection point for official event and organizer artwork.

## Current Assets

| File | Purpose |
|---|---|
| `gdg-on-campus-epi.png` | GDG on Campus EPI organizer mark with a black background |
| `isitcom-google-club.svg` | ISITCom Google Club organizer mark |

## Reserved LilTech Asset Slots

Add a dedicated event logo only when the organizers provide one, then wire it in [`apps/web/src/config/brand.ts`](../../src/config/brand.ts):

| File | Purpose |
|---|---|
| `logo.svg` | Default primary logo (when theme-neutral) |
| `logo-light.svg` | Logo variant for light surfaces |
| `logo-dark.svg` | Logo variant for dark surfaces |
| `favicon.svg` | Vector favicon (and replace `apps/web/public/favicon.ico` if updated) |

## Rules

- **Do not** invent or draw an unofficial logo here.
- Until a dedicated LilTech event logo is added, `BrandMark` renders the configured LilTech text wordmark while `OrganizerMarks` renders the supplied partner artwork.
- Update visual colors and typography centrally in `apps/web/src/styles/tokens.css` and `apps/web/src/styles/theme.css` — never inside individual components.

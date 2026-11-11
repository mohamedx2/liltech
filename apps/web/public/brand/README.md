# LilTech 2026 — Official Brand Assets Directory

This folder is the single injection point for the official LilTech visual assets once finalized by the organizers (**GDG on Campus EPI** and **ISITCom Google Club**).

## Expected Asset Slots

Drop official files here and wire their paths in [`apps/web/src/config/brand.ts`](../../src/config/brand.ts):

| File | Purpose |
|---|---|
| `logo.svg` | Default primary logo (when theme-neutral) |
| `logo-light.svg` | Logo variant for light surfaces |
| `logo-dark.svg` | Logo variant for dark surfaces |
| `favicon.svg` | Vector favicon (and replace `apps/web/public/favicon.ico` if updated) |

## Rules

- **Do not** invent or draw an unofficial logo here.
- Until official files are added, `BrandMark` automatically renders the neutral text wordmark configured in `apps/web/src/config/brand.ts`.
- Update visual colors and typography centrally in `apps/web/src/styles/tokens.css` and `apps/web/src/styles/theme.css` — never inside individual components.

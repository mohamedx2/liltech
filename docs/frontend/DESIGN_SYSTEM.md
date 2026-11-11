# LilTech 2026 — Frontend Design System & Brand Injection Guide

> Neutral, accessible, brand-independent UI foundation for `apps/web/`.
> Official LilTech colors, logos, and typography are intentionally deferred and will be injected through configuration and design tokens without rewriting pages or components.

---

## 1. Three-Layer Token Architecture

`apps/web` uses plain **CSS custom properties + CSS Modules** (Tailwind CSS is not installed in this workspace). Tokens follow a strict layered structure imported in [`apps/web/src/app/globals.css`](../../apps/web/src/app/globals.css):

1. **Layer 1 — Primitive Tokens ([`apps/web/src/styles/tokens.css`](../../apps/web/src/styles/tokens.css))**
   - Temporary neutral palette (`--palette-neutral-0` through `--palette-neutral-950`) and accessible semantic status primitives (`--palette-green-*`, `--palette-amber-*`, `--palette-red-*`, `--palette-blue-*`).
   - Spacing scale (`--space-1` = `0.25rem` up to `--space-20` = `5rem`).
   - Typography scale (`--font-sans`, `--font-mono`, `--font-heading`, `--font-body`, `--text-xs` through fluid `--text-3xl`, `--leading-*`).
   - Shape, elevation, motion, and layout tokens (`--radius-sm/md/lg/full`, `--shadow-sm/md/lg`, `--transition-fast/base`, `--content-width`, `--content-width-narrow`, `--header-height`, `--z-*`).

2. **Layer 2 — Semantic Tokens & Color Scheme ([`apps/web/src/styles/theme.css`](../../apps/web/src/styles/theme.css))**
   - Maps semantic tokens (`--color-bg`, `--color-surface`, `--color-surface-raised`, `--color-text`, `--color-text-muted`, `--color-primary`, `--color-secondary`, `--color-accent`, `--color-border`, `--color-focus-ring`, plus `--color-success/warning/error/info*`).
   - Uses `:root { color-scheme: light dark; }` paired with CSS `light-dark()` and explicit `@media (prefers-color-scheme: dark)` / `:root:has(> head > meta[name='color-scheme'][content='dark'|'light'])` fallbacks so the UI works without JavaScript and also honors manual `ThemeToggle` overrides without flash of wrong theme (inline script in [`layout.tsx`](../../apps/web/src/app/layout.tsx)).
   - Supports High Contrast / Forced Colors Mode (`@media (forced-colors: active)`) using system colors (`Canvas`, `CanvasText`, `GrayText`, `ButtonBorder`, `Highlight`).
   - Components must **never** hardcode hex colors inside component CSS — always consume Layer 2 tokens (`var(--color-*)`).

3. **Layer 3 — Scoped Component Modules (`*.module.css`)**
   - Component styling lives next to each component (`apps/web/src/components/**/*.module.css`, `apps/web/src/features/**/*.module.css`, `apps/web/src/app/**/*.module.css`).
   - Global CSS avoids `*` resets, prefers logical properties (`margin-block-*`, `padding-inline-*`), and respects `@media (prefers-reduced-motion: reduce)`.

---

## 2. How to Inject Official Brand Assets Later

When the official visual identity is finalized, **only two locations need updating**:

### Step A — Drop Assets in `apps/web/public/brand/`

See [`apps/web/public/brand/README.md`](../../apps/web/public/brand/README.md) for expected file slots:
- `logo-light.svg` (for light backgrounds)
- `logo-dark.svg` (for dark backgrounds)
- `logo.svg` (single-asset fallback)
- `favicon.svg` (icon asset)

### Step B — Update Centralized Config & Tokens

1. Update paths, names, and font CSS variable hooks in [`apps/web/src/config/brand.ts`](../../apps/web/src/config/brand.ts):
   - Set `logos.light` / `logos.dark` (or `logos.default`) to `'/brand/...'`.
   - Update `favicon` to `'/brand/favicon.svg'`.
2. `<BrandMark />` ([`brand-mark.tsx`](../../apps/web/src/components/layout/brand-mark.tsx)) automatically switches from the temporary neutral `LilTech 2026` wordmark to the official SVG images across the public header, footer, and portal shell.
3. Replace primitive palette hex values and `--font-heading` / `--font-body` in [`tokens.css`](../../apps/web/src/styles/tokens.css) and semantic pairs in [`theme.css`](../../apps/web/src/styles/theme.css). Verify WCAG AA contrast (`>= 4.5:1` body text, `>= 3:1` controls/borders) in both light and dark modes.

---

## 3. Component Catalog (`apps/web/src/components/`)

| Category | Component | Path | Key Features / Accessibility |
|---|---|---|---|
| Layout | `BrandMark` | `components/layout/brand-mark.tsx` | Logo slot switcher (`light`/`dark` CSS visibility) + text wordmark fallback |
| Layout | `PageContainer` | `components/layout/page-container.tsx` | Centered responsive container (`default` `72rem` / `narrow` `44rem`) |
| Layout | `SiteHeader` | `components/navigation/site-header.tsx` | Public links with `aria-current="page"`, auth session actions, mobile `<Dialog>` menu |
| Layout | `SiteFooter` | `components/layout/site-footer.tsx` | Organizer credits (`brandConfig`), quick links, optional `ThemeToggle` |
| Layout | `DashboardShell` | `components/layout/dashboard-shell.tsx` | Role-scoped sidebar navigation (`team`, `jury`, `admin`) ready for Persons 2 & 3 |
| Auth | `RoleGuard` | `components/auth/role-guard.tsx` | Client UX gate showing loading, unauthenticated, error, or forbidden recovery views |
| UI | `Button`, `buttonClassName` | `components/ui/button.tsx` | Variants (`primary`, `secondary`, `outline`, `ghost`, `danger`), `loading` spinner (`aria-busy`) |
| UI | `Card`, `CardHeader`, `CardTitle`, ... | `components/ui/card.tsx` | Semantic containers (`surface="default" \| "raised"`), `CardTitle` supports `h1`–`h4` |
| UI | `Badge` | `components/ui/badge.tsx` | Tones (`neutral`, `info`, `success`, `warning`, `danger`) with optional indicator dot + label |
| UI | `FormField`, `TextInput`, `Textarea`, `Select` | `components/ui/input.tsx` | Label & hint above control, `aria-describedby` linking hint + error, `aria-invalid` + `:user-invalid` |
| UI | `Dialog` | `components/ui/dialog.tsx` | Native `<dialog>` via `showModal()` top-layer, inert background, `Esc` dismissal, `overscroll-behavior: contain` |
| UI | `DataTable` | `components/ui/table.tsx` | Responsive scrollable wrapper, `<caption>`, `<th scope="col">`, zero cell overflow |
| UI | `ThemeToggle` | `components/ui/theme-toggle.tsx` | System / Light / Dark override via `<meta name="color-scheme">` + `localStorage` cross-tab sync |
| Feedback | `Alert` | `components/feedback/alert.tsx` | Icon + title + body (never color-only), `role="alert"` / `role="status"` |
| Feedback | `LoadingState`, `EmptyState`, `ErrorState`, `SuccessState` | `components/feedback/state-panel.tsx` | Uses native `<progress>` for loading and retry/action slots for error/empty/success |
| Events | `EventPhaseBanner`, `ServerCountdown`, `ApiStatus` | `components/events/` | Authoritative server-time offset countdown & live API status |

---

## 4. Operational vs Public Styling Policy

Consistent with [`AGENTS.md`](../../AGENTS.md) §6:
- **Public & participant screens:** Clear hierarchy, readable typography, generous breathing room.
- **Operational screens (check-in, jury scoring, admin):** Reuse the same `Card`, `DataTable`, `FormField`, `Alert`, and `Button` primitives with **zero decorative animation** so staff and jury workflows stay fast and predictable.

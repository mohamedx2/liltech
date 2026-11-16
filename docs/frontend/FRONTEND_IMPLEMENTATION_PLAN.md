# LilTech 2026 — Frontend Implementation Plan

> Status: Phase 1 discovery and planning document for `apps/web/`.
> Grounded in [`AGENTS.md`](../../AGENTS.md), [`README.md`](../../README.md), [`docs/architecture/overview.md`](../architecture/overview.md), [`docs/api/README.md`](../api/README.md), and [`docs/decisions/OPEN_QUESTIONS.md`](../decisions/OPEN_QUESTIONS.md).

---

## 1. Current Repository Audit (`apps/web`)

| Area | Current State | Notes |
|---|---|---|
| Framework | Next.js 16 (`output: 'standalone'`), React 19, TypeScript strict mode | Uses App Router (`apps/web/src/app/`) |
| Styling | CSS custom properties in `apps/web/src/app/globals.css` | Tailwind CSS is **not** installed; use CSS Modules + CSS variables |
| Pages | `src/app/layout.tsx` and `src/app/page.tsx` only | `error.tsx` and `not-found.tsx` do not exist yet |
| Components | `src/components/api-status.tsx` (`'use client'`) | Exercises `api.getHealth()` |
| API Client | `src/lib/api/` (`index.ts`, `transport.ts`, `errors.ts`, `transports/real.ts`, `transports/mock.ts`) | Switches `real` / `mock` via `NEXT_PUBLIC_API_MODE` |
| Env Config | `src/config/env.ts` (Zod-validated) | Exposes `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_API_MODE` |
| Shared Libs | `libs/api-contracts` (`Role`, `EventPhase`, `TeamProgressState`, `ChallengeTrack`, `ApiErrorBody`, `HealthResponse`, `PaginatedResponse`) & `libs/shared` (`time.ts`, `assertNever`) | Strict Nx boundary rules (`scope:web` → `scope:shared`, `type:contract`, `type:util`) |
| Backend Status | Only `GET /api/health` is implemented in `apps/api` | All other endpoint groups in `docs/api/README.md` are planned |
| Tests | Vitest + `@testing-library/react` (`apps/web/specs/index.spec.tsx`) | 1 smoke test currently |

---

## 2. User Roles, Event Phases, and Progress States

Canonical constants live in `libs/api-contracts/src/lib/` and must never be redefined in `apps/web`:

- **Roles (`Role`):**
  - `team` — Registered team account (4–7 participants led by a team leader)
  - `jury` — Challenge-scoped evaluator (isolated to assigned track)
  - `admin` — Event staff / administrators (check-in operations, event lifecycle, management)
- **Event Phases (`EventPhase`):**
  1. `registration` — Teams register before the event
  2. `checkin` — Entrance staff scan participant QR badges
  3. `live` — Starts at 20:00; Mini-CTF opens and main challenge unlocks on solve
  4. `submissions_closed` — Starts at 08:00; deliverable submissions locked server-side
  5. `pitching` — Starts at 09:00; teams pitch, juries evaluate
  6. `results` — Starts at 11:00; final results and two podiums published
- **Team Progress (`TeamProgressState`):**
  - `registered` → `checked_in` → `ctf_unlocked` → `ctf_solved` → `challenge_unlocked` → `submitted`
- **Parallel Tracks (`ChallengeTrack`):**
  - `track_a`, `track_b` (two parallel challenges, two juries, two podiums)

---

## 3. Information Architecture & Route Groups

Organized cleanly under `apps/web/src/app/` with Next.js App Router route groups:

| Route Group | Routes | Access | Owner |
|---|---|---|---|
| Global | `layout.tsx`, `error.tsx`, `not-found.tsx` | All | Person 1 |
| `(public)` | `/` (Landing), `/schedule` (Timeline), `/challenges` (Track Overview) | Public | Person 1 |
| `(auth)` | `/login`, `/register` (Team 4–7 member registration), `/unauthorized` | Public / Guest | Person 1 |
| `(participant)` | `/team` (Dashboard & QR pass), `/team/ctf` (Mini-CTF Gate), `/team/challenge`, `/team/submissions`, `/team/announcements` | `Role.Team` | Person 2 |
| `(staff)` / Check-In | `/checkin` (QR Check-In Scanner & Eligibility) | `Role.Admin` (staff) | Person 3 |
| `(jury)` | `/jury` (Track-Scoped Assigned Teams), `/jury/evaluate/[teamId]` | `Role.Jury` | Person 3 |
| `(admin)` | `/admin` (Phase Controls), `/admin/teams`, `/admin/ctf`, `/admin/challenges`, `/admin/jury`, `/admin/announcements`, `/admin/results` | `Role.Admin` | Person 3 |
| Results | `/results` / `/leaderboard` (Visibility gated by `OPEN_QUESTIONS.md` #4) | Server-gated | Person 3 |

---

## 4. Navigation Structure

- **Public Header:** Brand wordmark/logo slot (`/`), Schedule (`/schedule`), Tracks (`/challenges`), Register (`/register`), Sign In (`/login`). Mobile menu uses an accessible native `<dialog>` drawer.
- **Role-Aware Shell (`DashboardShell`):** Renders navigation strictly relevant to the authenticated user's server-verified `Role`, plus current `EventPhase` badge and quick Sign Out action. Never implies admin/jury privilege without backend verification.
- **Footer:** Neutral organizer attribution (`GDG on Campus EPI` & `ISITCom Google Club`), platform status link, and unobtrusive `ThemeToggle` (`System` / `Light` / `Dark`).

---

## 5. Main User Workflows

1. **Public Discovery & Registration (Person 1):**
   - Visitor views live `EventPhase`, server-synchronized countdown, schedule, and track summary → Team leader registers 4–7 participants → Receives confirmation (and QR badge delivery notice once backend email module is live).
2. **Authentication & Route Protection (Person 1):**
   - User signs in via `/login` → Backend establishes session → UI routes user to their role portal (`team`, `jury`, `admin`) → Expired (`401`) or forbidden (`403`) requests redirect or render clear recovery UI.
3. **Entrance Check-In (Person 3):**
   - Staff scans/enters participant QR token → Server verifies token and marks participant checked-in → Team progress transitions when eligible.
4. **Night-Long Competition Flow (Person 2):**
   - Event transitions to `live` at 20:00 → Checked-in team submits Mini-CTF flag → Server validates and rate-limits → On valid solve, server unlocks main challenge (`track_a` or `track_b`) → Team reads brief/resources → Team submits deliverables before 08:00 (`submissions_closed`) → Monitors live announcements.
5. **Evaluation & Results (Person 3):**
   - Jury signs in → Sees only their assigned track (`track_a` or `track_b`) → Evaluates submissions and enters own scores → Admin publishes results & two podiums at 11:00.

---

## 6. Component & Design System Architecture

- **Brand-Independent Foundation:**
  - `apps/web/public/brand/README.md` documents asset slots (`logo.svg`, `logo-light.svg`, `logo-dark.svg`, `favicon.svg`). No unofficial SVG logo is created.
  - `apps/web/src/config/brand.ts` centralizes product name, tagline, organizers, asset paths, and wordmark fallback.
  - Three-layer neutral token system: `src/styles/tokens.css` (primitives) → `src/styles/theme.css` (semantic tokens with `light-dark()` + `@media (prefers-color-scheme: dark)` fallback + `@media (forced-colors: active)`) → component `.module.css` files.
- **UI Primitives (`src/components/ui/`):** `Button`, `Card`, `Badge`, `FormField`, `TextInput`, `Textarea`, `Select`, `Dialog` (native `<dialog>` + `showModal()`), `Table`, `ThemeToggle`.
- **Feedback (`src/components/feedback/`):** `Alert`, `StatePanel` (`LoadingState`, `EmptyState`, `ErrorState`, `SuccessState`), `Skeleton`.
- **Layout & Auth (`src/components/layout/`, `navigation/`, `auth/`):** `BrandMark`, `SiteHeader`, `SiteFooter`, `DashboardShell`, `RoleGuard`.
- **Events (`src/components/events/`):** `ApiStatus`, `EventPhaseBanner`, `ServerCountdown`.

---

## 7. API Integration & Pending Contracts

All HTTP requests go through `apps/web/src/lib/api/` using `env.NEXT_PUBLIC_API_URL` and `env.NEXT_PUBLIC_API_MODE`:

| Module | Endpoint Group (`docs/api/README.md`) | Backend Status | Frontend Strategy |
|---|---|---|---|
| `health` | `GET /api/health` | **Implemented** | Uses `healthResponseSchema` from `libs/api-contracts` |
| `events` | Event state & server time | **Planned (missing)** | Provisional adapter types in `lib/api/contracts/pending.ts`; `mock` handler for UI dev; `real` fails cleanly if 404 |
| `auth` | Login / logout / current session | **Planned (missing)** | Same provisional adapter; zero client-side credential storage |
| `registrations` | Team registration (4–7 participants) | **Planned (missing)** | Same provisional adapter; Zod client validation mirrors spec constraints |
| `participants`, `mini-ctf`, `challenges`, `submissions`, `announcements` | Team competition endpoints | **Planned (missing)** | Owned by Person 2 |
| `checkin`, `jury`, `scoring`, `admin`, `results` | Operational & evaluation endpoints | **Planned (missing)** | Owned by Person 3 |

### Blocked Product Rules (`docs/decisions/OPEN_QUESTIONS.md`)

Frontend code must **not** assume or hardcode answers to:
1. Track assignment logic (`track_a` vs. `track_b`)
2. Shared vs. per-track Mini-CTF structure
3. Leaderboard tie-break rules
4. Live leaderboard visibility during the event
5. Jury score aggregation formula
6. Repository license
7. Real-time transport (SSE vs. WebSockets — no real-time dependency added yet)
8. Email provider for QR badge delivery

---

## 8. States, Responsiveness & Accessibility

- **Async View States:** Every async panel/form implements explicit `loading`, `error` (normalized via `ApiClientError`), `empty`, and `success` states.
- **Forms:** Labels and format hints positioned above inputs, `autocomplete` attributes for sign-in/registration, `:user-invalid` + synced `aria-invalid` + `aria-describedby` error linking, focusable error summary on submit failure, duplicate-submit disabled lock while pending.
- **Responsive Targets:** Mobile (`375px`+), tablet, laptop, and desktop; `min-block-size: 44px`–`48px` tap targets; `font-size: max(1rem, 1em)` on inputs to prevent mobile zoom; scrollable responsive tables.
- **Accessibility:** Semantic landmarks (`<header>`, `<nav>`, `<main id="main-content">`, `<footer>`), single `<h1>` per page, skip link, `:focus-visible` outline, `prefers-reduced-motion`, native `<dialog>` top-layer modals, WCAG AA contrast (`>= 4.5:1` normal text, `>= 3:1` UI boundaries) in both light and dark modes, and no color-only status indicators.

---

## 9. Phased Delivery Plan (3-Developer Split)

- **Phase A (Person 1 — Foundation, Public & Auth):** Implementation plan & docs, brand-independent tokens & light/dark theme, `public/brand/` + `brand.ts`, UI primitives, `error.tsx` & `not-found.tsx`, modular `lib/api/` + mock adapter, `AuthProvider` & `RoleGuard`, Public pages (`/`, `/schedule`, `/challenges`), Auth & Registration (`/login`, `/register`, `/unauthorized`), tests & frontend docs.
- **Phase B (Person 2 — Participant Experience):** Team dashboard, QR pass, Mini-CTF gate, unlocked challenge workspace, deliverables & deadline lock, announcements feed.
- **Phase C (Person 3 — Operations, Jury, Admin & Results):** Fast zero-animation QR check-in, track-scoped jury scoring, admin phase/entity controls, two-track leaderboards & podiums.
- **Phase D (All — Real Backend Integration & QA):** Replace provisional contracts as `libs/api-contracts` and `apps/api` endpoints ship, test `NEXT_PUBLIC_API_MODE=real`, run full accessibility & responsive QA.

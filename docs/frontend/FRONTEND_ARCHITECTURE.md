# LilTech 2026 — Frontend Architecture

> Architectural guide for `apps/web/` covering routing, component boundaries, authentication UX gating, and onboarding notes for Persons 2 and 3.

---

## 1. Monorepo & Nx Boundaries

Enforced automatically by `@nx/enforce-module-boundaries` ([`eslint.config.mjs`](../../eslint.config.mjs)):

- `apps/web` (`scope:web`) **may import** from:
  - `api-contracts` (`libs/api-contracts`) — `Role`, `EventPhase`, `TeamProgressState`, `ChallengeTrack`, `ApiErrorBody`, `HealthResponse`, `isoTimestampSchema`, etc.
  - `shared` (`libs/shared`) — `parseIsoTimestamp`, `formatDurationMs`, `formatUtcTime`, `assertNever`.
- `apps/web` **must never import** from `apps/api`, `@prisma/client`, Express internals, or Node-only packages inside browser components.
- Never duplicate canonical enums or timestamp utilities inside `apps/web`.

---

## 2. Directory Layout (`apps/web/src/`)

```text
apps/web/src/
├── app/
│   ├── (public)/              # Person 1: /, /schedule, /challenges
│   ├── (auth)/                # Person 1: /login, /register, /unauthorized
│   ├── (participant)/         # Planned (Person 2): /team/*
│   ├── (jury)/                # Planned (Person 3): /jury/*
│   ├── (admin)/               # Planned (Person 3): /admin/*, /checkin, /results
│   ├── boundary.module.css
│   ├── error.tsx              # Global error boundary ('use client')
│   ├── globals.css            # Token imports + base element rules + focus + dialog scroll lock
│   ├── layout.tsx             # RootLayout: lang, color-scheme anti-FOUC init, skip link, AuthProvider
│   └── not-found.tsx          # Global 404 boundary
├── components/
│   ├── auth/                  # RoleGuard (client UX gate)
│   ├── events/                # ApiStatus, EventPhaseBanner, ServerCountdown
│   ├── feedback/              # Alert, LoadingState, EmptyState, ErrorState, SuccessState
│   ├── layout/                # BrandMark, PageContainer, SiteFooter, DashboardShell
│   ├── navigation/            # SiteHeader (desktop nav + mobile native <dialog>)
│   └── ui/                    # Button, Card, Badge, FormField/Inputs, Dialog, DataTable, ThemeToggle
├── config/
│   ├── brand.ts               # Centralized product metadata, logo slots, favicon, typography hooks
│   └── env.ts                 # Zod-validated NEXT_PUBLIC_* environment variables
├── features/
│   ├── auth/                  # LoginForm, UnauthorizedView
│   └── registration/          # TeamRegistrationForm (3–5 participants constraint)
├── lib/
│   ├── api/                   # Centralized typed API client, endpoints, transports, mocks, pending contracts
│   └── auth/                  # AuthProvider context, session state, role-to-route access helpers
└── styles/
    ├── tokens.css             # Layer 1 primitive design tokens
    └── theme.css              # Layer 2 light/dark & forced-colors semantic tokens
```

---

## 3. Server vs Client Component Conventions

Follow [`AGENTS.md`](../../AGENTS.md) §5 strictly:

- **Default to Server Components** for layouts and route entry files (`app/**/page.tsx`, `app/**/layout.tsx`) so page metadata (`title`, `description`) and static structure stay server-rendered.
- **Push `'use client'` down to interactive leaves / forms / live panels**:
  - `SiteHeader` (reads session context & controls mobile `<Dialog>`)
  - `ThemeToggle` (reads/writes `<meta name="color-scheme">` and `localStorage`)
  - `EventPhaseBanner`, `ServerCountdown`, `ApiStatus` (intervals / fetch lifecycle)
  - `LoginForm`, `TeamRegistrationForm`, `UnauthorizedView`, `RoleGuard`, `DashboardShell`
- Never instantiate `fetch` or read non-`NEXT_PUBLIC_*` env vars in components.

---

## 4. Authentication & Role Routing Guide (For Persons 2 & 3)

### Root Provider

[`RootLayout`](../../apps/web/src/app/layout.tsx) wraps the app in `<AuthProvider>` (`apps/web/src/lib/auth/session.tsx`), which calls `api.auth.getSession()` on mount and exposes `{ status, user, errorMessage, isMockMode, login, logout, refreshSession }` via `useAuth()`.

> **Security note:** Client auth state is **purely for UX routing and navigation visibility**. The backend enforces authentication, role checks (`team` / `jury` / `admin`), challenge-track scoping for juries, event phase gates, and CTF unlock verification on every request.

### Protecting Future Route Groups

Persons 2 and 3 can wrap their route group layouts directly with `RoleGuard` and `DashboardShell`:

```tsx
// Example for app/(participant)/layout.tsx (Person 2)
import type { ReactNode } from 'react';
import { Role } from 'api-contracts';
import { RoleGuard } from '@/components/auth/role-guard';
import { DashboardShell } from '@/components/layout/dashboard-shell';

export default function ParticipantLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowedRoles={[Role.Team]}>
      <DashboardShell role={Role.Team}>{children}</DashboardShell>
    </RoleGuard>
  );
}
```

### Jury Evaluation Portal (`(jury)`)

The Jury workspace (`/jury` and `/jury/evaluate/[teamId]`) enforces strict challenge track isolation (e.g. `track_a` or `track_b`):
- **Jury Layout (`apps/web/src/app/(jury)/layout.tsx`):** Guarded with `RoleGuard allowedRoles={[Role.Jury]}` and wrapped in `DashboardShell role={Role.Jury}`.
- **Assigned Teams Overview (`/jury`):** Track banner with track title/description, evaluation progress metrics (Assigned, Evaluated, Pending, Average score), search & status filter tabs ('All', 'Pending', 'Graded'), and a semantic `DataTable` listing deliverables and actions.
- **Team Evaluation Workspace (`/jury/evaluate/[teamId]`):** Detailed review of team deliverables (GitHub repo and uploaded files), 4 standardized criteria (Technical Execution, Innovation, UI/UX, Pitch — 25 pts each, 100 pts total) with synchronized range sliders, number inputs, and fast presets, real-time total score calculation with rating bands, qualitative jury notes, and submission locking.

### Admin Control Panel & Staff Check-In Scanner (`(admin)`)

The Admin workspace (`/admin` and `/checkin`) provides high-density, authoritative operational controls:
- **Admin Layout (`apps/web/src/app/(admin)/layout.tsx`):** Guarded with `RoleGuard allowedRoles={[Role.Admin]}` and wrapped in `DashboardShell role={Role.Admin}`.
- **Admin Dashboard (`/admin`):** High-density event orchestration center featuring:
  - Authoritative Phase Control Stepper (`registration` → `checkin` → `live` → `submissions_closed` → `pitching` → `results`) with confirmation modal and server synchronization (`POST /api/event-state`).
  - Infrastructure Health Telemetry querying `api.health.getHealth()` (PostgreSQL latency, database connectivity, and API uptime).
  - Organizer Broadcast Announcement Composer with character counter and instant distribution (`POST /api/announcements`).
  - Audited Activity Stream (`GET /api/admin/audit-log`) displaying chronological admin actions with actor attribution and UTC timestamps.
- **Staff Check-In Scanner (`/checkin`):** Ultra-fast, zero-distraction barcode/QR badge validation interface designed for physical check-in desks:
  - Auto-focusing scanner input listening for hardware 2D barcode / QR scanners or manual entry with automated validation (`POST /api/checkin/scan`).
  - Visual status feedback (audio cue hooks, confirmation toasts, and duplicate/invalid alerts).
  - Real-time venue attendance counter (Total Registered, Checked In, Attendance % progress bar).
  - Searchable and filterable badge roster with instant credential revocation (`POST /api/checkin/revoke`).

Role home routes and portal navigation links are already centralized in [`apps/web/src/lib/auth/route-access.ts`](../../apps/web/src/lib/auth/route-access.ts):
- `Role.Team` → `/team` (`/team`, `/team/ctf`, `/team/challenge`, `/team/submissions`, `/team/announcements`)
- `Role.Jury` → `/jury` (`/jury`, `/schedule`)
- `Role.Admin` → `/admin` (`/admin`, `/checkin`, `/admin/teams`, `/admin/challenges`, `/admin/jury`, `/admin/results`)

---

## 5. Accessibility & Responsive Guarantees

- **Landmarks & Skip Link:** Root layout renders a focus-revealed `<a href="#main-content" className="skip-link visually-hidden">` jumping directly into `<main id="main-content">`. Pages keep a single `<main>` landmark and single `<h1>`.
- **Keyboard & Focus:** Visible `:focus-visible` outlines (`--color-focus-ring`), native `<button>` and `<a>` semantics, native `<dialog>` top-layer modality (`Esc` and focus return handled by browser).
- **Forms:** Accessible error summaries (`role="alert"`, `tabIndex={-1}`) focused on validation/submission failure, inline field errors linked with `aria-describedby`, required markers, `autocomplete` tokens, and `min-block-size: 44px–48px` touch targets.
- **Reduced Motion:** `globals.css` honors `@media (prefers-reduced-motion: reduce)` globally.

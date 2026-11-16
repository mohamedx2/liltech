# Gap Analysis — Missing & Not Working (LilTech 2026)

> Generated 2026-11-14. Covers everything still missing, blocked, or unreliable across
> frontend, backend, infrastructure, and process. Complements
> `docs/deployment/CONFIGURATION.md` (what is configured) and
> `docs/decisions/OPEN_QUESTIONS.md` (business decisions pending maintainer confirmation).

---

## 1. Frontend — Pages That Do Not Exist

The frontend plan (`docs/frontend/FRONTEND_IMPLEMENTATION_PLAN.md`) maps 11 route groups,
but only 11 pages are built. These routes are **absent** with no fallback:

| Route group | Missing route | Owner (per plan) | Why it matters |
|---|---|---|---|
| Global | `error.tsx`, `not-found.tsx` | Person 1 | No global error boundary or 404 page; a broken route falls back to Next.js defaults |
| Staff / check-in | `/checkin` | Person 3 | Entrance staff have no QR scanner UI — cannot check in participants on event night |
| Jury | `/jury`, `/jury/evaluate/[teamId]` | Person 3 | Jury cannot see assigned teams or enter scores |
| Admin | `/admin`, `/admin/teams`, `/admin/ctf`, `/admin/challenges`, `/admin/jury`, `/admin/announcements`, `/admin/results` | Person 3 | No operational dashboard — no phase control, team management, jury assignment, or results publication |
| Results | `/results`, `/leaderboard` | Person 3 | No podium publication; teams and public cannot see final results |

**Components exist but are disconnected:** UI primitives (`Button`, `Card`, `Badge`, `Dialog`, `StatePanel`, `Alert`), layout (`DashboardShell`, `SiteHeader`, `RoleGuard`), and event components (`ApiStatus`, `EventPhaseBanner`, `ServerCountdown`) are built, but the pages that consume them for jury/admin/staff workflows do not exist yet.

---

## 2. Backend — Endpoint Groups Not Implemented

`docs/api/README.md` documents the contract. **Only 10 endpoint groups are implemented**
(health, auth, event-state, registration, check-in, announcements, audit-log). These groups
are **contract-planned only — zero routes exist**:

| Endpoint group | What it does | Blocked by |
|---|---|---|
| **Mini-CTF** | Flag submission, server-validated, rate-limited, attempt-logged | Q2 — CTF structure (shared vs per-track) |
| **Challenge** | Briefs/resources for unlocked track | Q1 — track assignment |
| **Submissions** | Team deliverables with deadline enforcement (08:00) | Q1 + storage decision (file uploads) |
| **Jury scoring** | Score entry (own scores only, challenge-scoped) | Q3–Q5 — scoring/leaderboard rules |
| **Results publication** | Podiums and final results at 11:00 | Q3–Q5 |
| **Real-time updates** | Live score/phase pushes | Q7 — SSE vs WebSockets |
| **Email delivery** | QR badge delivery to participants | Q8 — email provider |

### Implemented and working endpoints

| Endpoint | Method | Status |
|---|---|---|
| `/api/health` | GET | ✅ |
| `/api/auth/login` | POST | ✅ |
| `/api/auth/logout` | POST | ✅ |
| `/api/auth/me` | GET | ✅ |
| `/api/event-state` | GET / POST | ✅ |
| `/api/registration/teams` | POST | ✅ |
| `/api/registration/teams/me` | GET | ✅ |
| `/api/checkin/scan` | POST | ✅ |
| `/api/checkin/revoke` | POST | ✅ |
| `/api/checkin/badges` | GET | ✅ |
| `/api/announcements` | POST / GET | ✅ |
| `/api/admin/audit-log` | GET | ✅ |

---

## 3. Blocked — Open Questions (8 items, all pending)

`docs/decisions/OPEN_QUESTIONS.md` explicitly forbids inventing answers in code, migrations,
seeds, or docs. Until a maintainer confirms each, the corresponding feature **cannot** be built:

| # | Question | Status | Blocks |
|---|---|---|---|
| 1 | How teams are assigned to track A vs B | ❓ Pending | Challenge access, jury scoping, `Team.track` field |
| 2 | Mini-CTF structure (shared vs per-track) | ❓ Pending | CTF module, flag storage, attempt log |
| 3 | Leaderboard tie-break rules | ❓ Pending | Scoring/leaderboard ordering |
| 4 | Leaderboard visibility during event | ❓ Pending | Leaderboard endpoints & UI |
| 5 | Score aggregation across jurors (mean/median/weights) | ❓ Pending | Results computation |
| 6 | Repository license | ❓ Pending | Public release, `LICENSE` file |
| 7 | Real-time transport (SSE vs WebSockets) | ❓ Pending | Live updates module |
| 8 | Email provider for QR badges | ❓ Pending | Registration email flow |

**Rule enforced:** Nothing in Q1–Q5/Q7/Q8 may be implemented yet. The backend schema
intentionally omits `Team.track` and scoring models where they would require inventing an
answer.

---

## 4. Infrastructure — What Doesn’t Work Reliably

### A. Caddyfile changes need a manual restart
The deploy workflow copies `Caddyfile` to `/opt/liltech` and runs `docker compose up -d`.
But Compose only recreates containers when **service config changes**, not when a mounted
file’s content changes. This was hit live during the `www` fix:

- Deploy run `43523802547` pushed a Caddyfile adding `www.liltechsousse.com`
- Caddy container stayed on the 25-minute-old apex-only config (no www certificate)
- Fix required manual SSH: `docker compose -f docker-compose.prod.yml restart caddy`

**Gap:** The workflow has no `docker compose restart caddy` step after copying the Caddyfile.
Any future Caddyfile edit (new domain, route change, header rule) will silently not take
effect until someone restarts Caddy by hand.

### B. Smoke test only checks the API on raw ports
The external smoke test probes `:4000/api/health` and `:3000` from the runner. It does **not**
verify:
- `https://liltechsousse.com` (TLS termination through Caddy)
- `https://liltechsousse.com/api/health` (API routed through Caddy)
- `https://www.liltechsousse.com` (www SAN certificate)

So a deploy could pass CI while the domain or TLS is broken — as nearly happened with www.

### C. Ports 3000/4000 still publicly exposed
The Caddy proxy now serves traffic on 80/443 with TLS, but the API and web containers still
publish 4000/3000 directly to the host. There is no restriction to internal-only, so the
raw-IP endpoints are reachable without TLS.

---

## 5. Security — Open Items

| Item | Risk |
|---|---|
| `team-access` SSH key was shared in plaintext chat | Root key on public IP; **must be rotated** |
| SSH host keys pinned at runtime (`ssh-keyscan`) | MITM risk on first connect; no `known_hosts` pinning |
| Deploy runs as `root` on the VPS | Over-privileged; container compromise = full host |
| `DB_PASSWORD` exists only in GitHub secrets (write-only) | No local recovery path if lost; must be re-generated |
| No firewall on the VPS (ufw inactive, iptables ACCEPT-all) | Relies entirely on container-level exposure; provider-level ports open |

---

## 6. Testing — Partial Coverage

**Backend:** 13 tests pass (rate-limiter, QR token, password, app health). 25 skipped:
- 24 integration tests in `src/tests/integration.spec.ts` require `TEST_DATABASE_URL` — none run locally because no dev PostgreSQL is configured
- 1 app test skipped (DB-unreachable path already covered)

**Frontend:** 1 smoke test exists (`apps/web/specs/index.spec.tsx`). No tests for the missing
pages (which do not exist yet).

**E2E:** `apps/api-e2e/` scaffold exists but was not exercised in this session.

---

## 7. Summary — Current State by Layer

| Layer | Works | Missing / Broken |
|---|---|---|
| **Deploy pipeline** | ✅ Automatic on push to `main`, GHCR, VPS SSH, migrations, smoke test | ⚠️ Caddyfile changes need manual restart; smoke test doesn’t probe through Caddy |
| **Domain + TLS** | ✅ `liltechsousse.com` + `www`, HTTPS, HTTP→308 redirect, Let's Encrypt auto-renewal | |
| **API (implemented routes)** | ✅ Health, auth, event-state, registration, check-in, announcements, audit-log | ❌ Mini-CTF, challenge, submissions, jury scoring, results — all blocked by open questions |
| **Frontend pages** | ✅ Public (3) + auth (3) + participant (5) = 11 pages | ❌ error/not-found, check-in, jury (2), admin (7), results (2) |
| **Database** | ✅ Migrations applied, seed idempotent, 3 migrations | ❌ No scoring/leaderboard/CTF tables yet |
| **Security** | ✅ Argon2/bcrypt, sessions, rate limiting, QR tokens, audit log | ⚠️ SSH key rotation, host pinning, non-root deploy user |

---

## Recommended Next Steps (in order)

1. **Fix the Caddy restart gap** — add `docker compose restart caddy` to the deploy workflow after copying the Caddyfile, so future config changes apply without manual SSH.
2. **Extend the smoke test** — probe `https://liltechsousse.com/api/health` and `https://www.liltechsousse.com/api/health` through Caddy, not just raw ports.
3. **Rotate the `team-access` SSH key** — it was shared in chat; generate a new ed25519 pair, upload the public key to GitHub secrets, replace the VPS `authorized_keys`.
4. **Unblock the backlog** — get maintainer answers on Q1–Q5 (track assignment, CTF structure, scoring rules, leaderboard visibility, aggregation) so Mini-CTF, challenge, submissions, jury scoring, and results can be implemented.
5. **Build the missing pages** — start with `/checkin` (staff) and `/admin` (phase control), which need no open-question answers and unlock event-night operations.

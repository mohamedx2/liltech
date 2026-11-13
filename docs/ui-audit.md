# LilTech 2026 — UI/UX Audit (reskin pre-work)

Scope: `apps/web` presentation layer only. No source files were modified. Target design: black/cream/gold/crimson, Bricolage Grotesque + Cairo, pill buttons, asymmetric cards.

## 1. Stack summary

- Next.js `~16.4.1` App Router, React 19, TypeScript strict. No Tailwind, no UI kit (no MUI/Chakra/shadcn), no styled-components.
- Styling = **plain CSS Modules** (one `*.module.css` beside each component) + two global token files imported by `apps/web/src/app/globals.css`.
- No animation library installed (no GSAP, no Lenis, no framer-motion); the only `@keyframes` in the repo is the button spinner.
- No icon library: 1 icon component (`components/icons/lock-icon.tsx`) + 6 files with hand-written inline `<svg>`.
- Fonts: `--font-sans: 'Bricolage Grotesque'…`, `--font-arabic: 'Cairo'…` declared in `src/styles/tokens.css:66-71` but **never loaded** (no `next/font`, no `@font-face`, no `<link>`). Everything renders in the Segoe UI fallback.
- i18n/RTL: no library. `globals.css:37-41` has `[lang='ar'], [dir='rtl'] → var(--font-arabic)`; no `dir` handling anywhere else; Cairo unused.
- Theming: **dark-only**. `theme.css` sets `color-scheme: dark` and semantic vars; `brand.ts` has `defaultMode:'dark'`, `supportsColorSchemeSwitch:false`. `ThemeToggle` exists but has **zero importers**. Stale light-theme navy values still float in feature CSS (see §4.7).
- Breakpoints in use: 40rem (×5), 48rem (×10), 60rem, 64rem (×2), max-width 47.99rem and 32rem.

## 2. Route map

Layouts: **P** = `(public)/layout.tsx` (SiteHeader + main + SiteFooter) · **A** = `(auth)/layout.tsx` (same + narrow container + bordered panel) · **D** = `(participant)/layout.tsx` (RoleGuard + DashboardShell: header + sidebar + footer).

| Route | File (`src/app/…`) | Role | Layout | ~Comps | Forms | Tables | Live data | Modals |
|---|---|---|---|---|---|---|---|---|
| `/` ★ home | `(public)/page.tsx` | public | P | 9 | – | – | phase banner + API status | – |
| `/schedule` | `(public)/schedule/page.tsx` | public | P | 6 | – | DataTable | phase banner | – |
| `/challenges` | `(public)/challenges/page.tsx` | public | P | 6 | – | – | – | – |
| `/login` | `(auth)/login/page.tsx` | public | A | LoginForm | 1 + mock buttons | – | auth session | – |
| `/register` | `(auth)/register/page.tsx` | public | A | TeamRegistrationForm (502 lines) | 1 (dynamic rows) | – | – | – |
| `/unauthorized` | `(auth)/unauthorized/page.tsx` | any | A | UnauthorizedView | – | – | auth session | – |
| `/team` | `(participant)/team/page.tsx` | team | D | 6 | – | DataTable (roster) | phase + countdown | – |
| `/team/ctf` | `…/team/ctf/page.tsx` | team | D | 8 | flag form | – | gate status + cooldown | – |
| `/team/challenge` | `…/team/challenge/page.tsx` | team | D | 6 | – | – | challenge fetch | – |
| `/team/submissions` | `…/team/submissions/page.tsx` | team | D | 9 | upload form | DataTable | countdown + deadline | – |
| `/team/announcements` | `…/team/announcements/page.tsx` | team | D | 5 | – | – | 30 s polling | – |
| `/jury`, `/admin`, `/checkin` | **missing** | jury/admin | – | – | – | – | – | – |

Global boundaries: `app/error.tsx`, `app/not-found.tsx` (both render their own header/footer shell). Mobile nav is the only modal, opened from `site-header.tsx`.

## 3. Component inventory

Layout / shells (all shared, all used):

| Component | File | Used in |
|---|---|---|
| SiteHeader (+ mobile Dialog menu) | `components/navigation/site-header.tsx` | 4 layouts/pages |
| SiteFooter (footer nav + organizer marks) | `components/layout/site-footer.tsx` | 3 layouts + 2 boundaries |
| DashboardShell (sidebar, role nav) | `components/layout/dashboard-shell.tsx` | participant layout only |
| PageContainer (`narrow` variant) | `components/layout/page-container.tsx` | 6 |
| BrandMark (logo or text wordmark) | `components/layout/brand-mark.tsx` | header |
| OrganizerMarks (`compact/auth/footer`) | `components/layout/organizer-marks.tsx` | header, footer, login |

Primitives:

| Primitive | Variants | Shared? | Notes / duplication |
|---|---|---|---|
| Button | 5 variants × 3 sizes + `loading`, `fullWidth`; `buttonClassName()` for `<Link>` | yes (14 importers) | Best-behaved primitive; `sm` = 36px tall |
| Card | `surface: default \| raised` + Header/Title/Description/Content/Footer | yes (12 importers) | **`raised` renders identically to `default`** — `.raised{background:transparent}` in `card.module.css:14`; radius 0 + top hairline |
| Badge | 5 tones + `showDot` | yes (10) | Consistent |
| FormField + TextInput/Textarea | 1 field layout, 2 controls (+ `Select`, `InputGroup` exported but unused by any view) | yes (4) | Label above, hint, error, required mark |
| DataTable | 1 (caption + sticky `thead`) | yes (3) | Handles empty via caller |
| Alert | 4 tones → `role=alert/status` | yes (7) | — |
| LoadingState / EmptyState / ErrorState / SuccessState | 1 each | yes (9) | Skeleton bars are **static** (no shimmer) |
| Dialog | 1 (native `<dialog>` + `showModal`) | only site-header | Also used as "mobile menu" |
| ServerCountdown | 1 (d/h/m/s boxes) | 2 | Server-anchored clock |
| EventPhaseBanner | 4 internal states (loading / pending-backend / error / ready+live) | 2 | Own API fetch |
| ThemeToggle | 3 options | **orphan (0 imports)** | Keep or delete deliberately |
| Missing primitives | — | — | **No toast, no tabs, no tooltip, no drawer, no select-in-use, no pagination.** Announcement filters are a hand-rolled segmented control in `announcements-view.tsx` |

Feature components: `features/dashboard/{team-dashboard-view,stepper,qr-pass-card,team-roster}`, `features/mini-ctf/mini-ctf-view`, `features/challenges/challenge-view`, `features/submissions/submissions-view`, `features/announcements/announcements-view`, `features/auth/{login-form,unauthorized-view}`, `features/registration/team-registration-form`. All are page-local; none are reused across routes except Card/Table inside them.

Duplication hotspots (safe to consolidate during reskin):
- Page-header block (`.header/.headerTitles/.subHeading/.title/.description`) re-implemented in 4 feature CSS files + `.pageHeader` in `public.module.css`.
- `.errorSummary/.errorSummaryTitle/.errorList` and `.passwordRow/.passwordInput` duplicated in `login-form.module.css` and `team-registration-form.module.css`.
- `.lockedTitle` duplicated in `challenge-view.module.css` and `mini-ctf-view.module.css`.
- `.card { width: 100% }` repeated in 6 feature CSS files.

## 4. Design debt, top 15 (by visual impact)

1. **Fonts declared, never loaded** — `tokens.css:66-70`; no font asset/route exists. Every screen shows Segoe UI, so Bricolage/Cairo work will silently do nothing until a loader is added (`app/layout.tsx`).
2. **Organizer logo is a raster poster inside an SVG** — `public/brand/gdg-on-campus-epi.svg` (72 KB) is a 960×1330 portrait `<image>` with a base64 PNG, displayed at 2–3.5 rem tall (`organizer-marks.module.css:19-23`). Effectively an unreadable strip, and it is also the favicon (`config/brand.ts:61`).
3. **Cards carry no surface** — `card.module.css:1-15`: transparent, radius 0, single top border. `surface="raised"` is dead. Grids of these read as dividers, not cards.
4. **Home has no visual anchor** — hero is eyebrow + h1 + lead + 3 equal-size CTAs (`(public)/page.tsx:52-76`); no logo, no imagery, no countdown band of its own.
5. **Neon-crimson glow as ornament** — `#ff2a1f` glow in `button.module.css:57`, `dashboard-shell.module.css:62`, `event-phase-banner.module.css:14`, `stepper.module.css:98-100`, `announcements-view.module.css:89`. Five different "active" languages plus a contrast failure (§5).
6. **Mixed radius language** — pill (`radius-full`: buttons, badges, nav links) vs `radius-lg 1.75rem` (panels, dialog, tables, fieldsets) vs literal `0` (cards, timeline items, member cards, resource rows).
7. **Legacy navy fallbacks from an abandoned light theme** — `#121730`, `#161c38`, `#6d78a3`, `#0b0e1a` in `stepper.module.css:44,77,86,101`, `submissions-view.module.css:138,160`, `announcements-view.module.css:64,88`.
8. **Five page-header variants, four of them 95 % identical** — see §3 duplication.
9. **Uniform symmetric grids** — 4 identical workflow cards (`public.module.css:150-154`) and 2 identical track cards; no asymmetry anywhere, so the requested asymmetric-card direction has no seam yet.
10. **`OrganizerMarks` intrinsic size contradicts its CSS** — `width="960" height="1330"` (`organizer-marks.tsx:11-25`) against `block-size: 2rem` → layout shift + blurry raster.
11. **Frozen skeleton** — `state-panel.tsx:23-26` renders `<progress>` + two static bars; looks like a rendering failure.
12. **White QR island** — `qr-pass-card.module.css:33-40` hardcodes `#ffffff` + radius-lg + a stray `rgba(0,0,0,.3)` shadow. QR needs the white plate; the shadow/radius do not match tokens.
13. **Focus ring on pills** — `globals.css:74-78` applies `outline: 3px …; border-radius: var(--radius-sm)` globally, so pill buttons get a rounded-rect halo.
14. **Fixed crimson radial wash on `body`** — `globals.css:31-35`; tints every route including operational screens.
15. **Loading label replaces button text** — `button.tsx:47-52` with no reserved width → CTA width jumps on submit.

Hardcoded values: **55 hex occurrences** in CSS, 51 of them inside `tokens.css`/`theme.css` (9 leak outside, see §4.7). Inline `style={{}}`: **2** (`state-panel.tsx:57,83`, both `marginTop`). Radius values: 4 tokens + 5 literals (`0`, `50%`). Shadows: 3 tokens + 5 ad-hoc glows. Font sizes: 8 tokens + ~10 literals (`0.6875rem`, `1.35rem`, `1.1`, three `clamp()`s, `max(1rem,1em)`).

Global bare-element rules (leak surface, `globals.css`): `*,*::before,*::after` (reduced-motion), `html`, `body`, `[lang='ar'],[dir='rtl']`, `::selection`, `h1–h4`,`p`, `h1–h4`, `a`, `button,input,select,textarea`, `:focus-visible`, `dialog:modal`, `dialog::backdrop`, `.visually-hidden` (12 `!important`). No global `img`/`svg`/`table`/`ul` rules — low leak risk, but the `body` gradient and the `:focus-visible` radius are brand decisions baked globally.

## 5. UX audit

**Buttons** — System is good: 5 variants, hover, disabled (`opacity .55`), `aria-busy` loading, `min-block-size 2.75rem`. Weak: `sm` = 2.25rem (36px, below 44px) and is used in the header, card footers, and error/empty actions; `ghost` has no affordance (registration "Remove" reads as plain text); several competing primaries per screen (home hero 3 × `lg`; dashboard up to 3 action cards each with an `lg` button); primary *hover* `#ff2a1f` + white = **3.75:1**, fails AA for its own text size (base `primary` `#d81b1b` on white = 5.1:1, passes).

**Cards** — Uniform identical grids (home workflow, tracks; submission receipt grid 3-up); inconsistent radius/padding across card-like objects (Card 0, fieldset `radius-lg`, member cards 0 with only a bottom border, resource rows 0); `receiptCard` communicates state by border colour alone. Mobile clipping: stepper is `min-width: 48rem` inside `overflow-x:auto` (`stepper.module.css:11,19`) → intentional horizontal scroll on phones; no other fixed widths.

**Forms** — Strong: explicit labels, hint text, inline error with icon, `aria-describedby`, `aria-invalid`, `required` + visual mark, error summary with anchor links and programmatic focus (`login-form.tsx:125-145`, `team-registration-form.tsx:231-260`). Weak: validation only fires on submit (no blur validation); no visible "required fields" legend; file input in submissions is a bare `<input type=file>` styled with a dashed border that matches no other control (`submissions-view.module.css:148-162`); the password reveal `Button` (md) crowds the field; `Select`/`InputGroup` are dead code.

**Navigation** — Sticky translucent header, desktop nav from 48rem, mobile = Dialog (a modal, not a drawer), labelled hamburger. Broken: active state uses **exact** `pathname === item.href` (`site-header.tsx:39`, `dashboard-shell.tsx:38`), so `/team/ctf` etc. highlight nothing and `/team` never stays active on sub-routes. Role gating renders an `ErrorState` in place instead of redirecting (`role-guard.tsx:41-78`). Footer and sidebar advertise `/jury`, `/admin`, `/checkin` that do not exist → 404.

**States** — Empty (announcements, submissions), loading, error + retry, and locked states all exist and are explicit: dashboard locked rows (`team-dashboard-view.tsx:160-215`), CTF locked card, challenge locked card, submissions-locked alert. Gaps: no success state on the dashboard; `ApiStatus` has no retry; `EventPhaseBanner` "pending-backend" copy is developer-facing; skeleton not animated.

**Responsiveness** — Sound breakpoint scale, `auto-fit/minmax` grids, `flex-wrap` on action rows. Risks: stepper horizontal scroll; 4–5 column tables inside a 40rem-tall scroller; header between 48–64rem carries brand + 4 nav items + 2 buttons (tight); `brandCluster { min-inline-size: max-content }` can push the row.

**Accessibility** — One `h1` per route, skip link, `aria-current`, labelled icon-only buttons, `alt` on all 6 `<img>`, `aria-live` on status/countdown/dialog semantics via `aria-labelledby`. Weak: only 2 component-level `focus-visible` rules exist (global outline covers the rest); `--color-text-dim` (50 % cream ≈ 4.6:1) is used for 11–12 px labels (`stepper.module.css:76-80`, `organizer-marks.module.css:13-17`); `role="feed"` wraps non-feed articles; text placed on the `#ff2a1f` hover state fails contrast.

**Tables / dense screens** — DataTable has caption, `scope="col"`, sticky header, `overflow-x`, `max-block-size: 40rem`. Roster (4 cols) and history (5 cols) are readable. **No admin / check-in / jury screens exist**, so the densest operational surfaces promised by the nav are unaudited because they are unbuilt.

**Motion** — Only `liltech-spin` (`button.module.css:130-135`). Transitions on buttons, nav links, theme toggle, stepper (`transition: all`) and announcement filters. Nothing animates on non-home routes beyond the spinner and the stepper's glow. `prefers-reduced-motion` is globally honoured (`globals.css:13-21`).

## 6. Logo / asset findings

| Asset | Size / format | Rendered where | Wrapper / CSS risks |
|---|---|---|---|
| `public/brand/gdg-on-campus-epi.svg` | 72 KB, SVG with **embedded base64 PNG**, viewBox 960×1330 (portrait) | OrganizerMarks (header ≥64rem, footer, login) **and favicon** (`brand.ts:61`) | `block-size: 2rem/2.4rem/2.75rem/3.5rem` + `object-fit: contain`; `width/height` attrs 960×1330 contradict CSS; no bg/border/radius/filter |
| `public/brand/isitcom-google-club.svg` | 67 KB, pure vector, 55 inline hex classes (`#fcbd03`, `#690508`…), viewBox 1099×1431, no `<rect>` background | same three places | full-colour artwork on black; own palette clashes with gold/crimson; same intrinsic-vs-CSS size mismatch |
| `public/favicon.ico` | 15 KB, 48 + 32 px | auto-served `/favicon.ico` | metadata `icons` points at the GDG **SVG** instead (`layout.tsx:17-19`) → two competing favicons |
| LilTech logo | — | — | `brand.logos` are all `null` → `BrandMark` prints text wordmark + "2026" pill (`brand-mark.module.css:19-34`). Also has fragile `:root:has(> head > meta[name='color-scheme'])` selectors (lines 50-66) |
| QR pass image | data-URL SVG from API, 180×180 | `qr-pass-card.tsx:47-55` | white plate `#ffffff` + radius-lg + ad-hoc shadow |

No background/border/padding/filter is applied to any logo by CSS beyond the shared `.logo` sizing. No og:image, no apple-touch-icon. `public/brand/README.md` reserves `logo.svg`, `logo-light.svg`, `logo-dark.svg`, `favicon.svg` slots.

## 7. Logic-coupling risk map

Rule of thumb for every row: **change `className` values, wrapper elements and CSS only**; never touch refs, ids, handlers, effect bodies, aria state attributes or user-visible copy.

| File | What is coupled | Safe edit rule |
|---|---|---|
| `features/registration/team-registration-form.tsx` | ids `#reg-team-name`, `#reg-password`, `#reg-leader-*`, `#reg-member-*-{rowKey}` are anchor targets of the error summary; `aria-pressed` on Show/Hide; `rowKey` drives React keys + field names `teammates[i].*` | Keep every `id`, `name`, `href`, `aria-*`; restyle fieldset/member/roster wrappers |
| `features/auth/login-form.tsx` | ids `login-email`/`login-password` queried by specs; `summaryRef` focus; password reveal button | Keep ids/ref/`type` toggle |
| `components/events/server-countdown.tsx` | 1 s interval; `aria-label` string `"… : 0d 0h 0m 5s"` asserted verbatim in `specs/server-countdown.spec.tsx` | Restyle units only; keep label text format |
| `components/events/event-phase-banner.tsx` | API fetch + 4 branch renders; badge copy asserted in specs | Keep branch strings and status machine |
| `features/dashboard/stepper.tsx` | `aria-current="step"` asserted; ✓/index indicators; `PROGRESS_STEPS` order | Keep `<ol>/<li>` structure and aria-current |
| `features/dashboard/team-dashboard-view.tsx` | progress→unlock thresholds, 3 branches per action card | Classes/wrappers only; don't reorder cards |
| `features/dashboard/qr-pass-card.tsx` | `handleDownload` creates a temporary `<a download>` from `badge.qrData`; white plate needed for scanability | Keep `<img src>`, white background, button handler |
| `features/mini-ctf/mini-ctf-view.tsx` | `errorSummaryRef` + `tabIndex={-1}` focus after failure; `handleSubmit`; cooldown timer | Classes only; keep ref/tabIndex/`disabled` logic |
| `features/submissions/submissions-view.tsx` | `fileInputRef.current.value = ''` reset; `accept` list; FormData keys | Don't touch ref or `accept`; restyle `.fileInput` |
| `features/announcements/announcements-view.tsx` | 30 s polling effect; filter state | Classes only |
| `components/ui/dialog.tsx` | `dialogRef` + `showModal/close` effect; `onCancel` preventDefault | Restyle `.dialog/.panel`; never move the `<dialog>` element |
| `components/ui/table.tsx` | `caption`, `scope="col"` asserted | Keep table/caption/thead semantics |
| `components/auth/role-guard.tsx` | 4 auth branches + link hrefs | Classes only |
| `components/navigation/site-header.tsx` | `usePathname` exact match → `aria-current`; logout loading state; Dialog open state | Keep pathname comparison + handlers |
| `components/layout/brand-mark.tsx` | Spec queries link named `/liltech 2026/i` (wordmark text) | Keep wordmark text or update spec deliberately |
| `components/api-status.tsx`, `state-panel.tsx` | `role="status"`, `aria-live`, `<progress aria-label>` asserted | Classes only |
| `components/ui/theme-toggle.tsx` | Writes `<meta name="color-scheme">`; localStorage key `color-scheme`; `brand-mark.module.css` reads that meta via `:has()` | Do not rename key or remove meta while either exists |
| `components/layout/dashboard-shell.tsx` | `aria-current` on sidebar links | Classes only |

## 8. Home page gap list (`(public)/page.tsx`)

| Target section | Status | Detail |
|---|---|---|
| Nav | **present** | `SiteHeader`, sticky; wordmark + organizer strips |
| Hero with logo | **partial** | Eyebrow, h1 (tagline), lead, 3 CTAs, gradient rule `::after`; **no logo, no imagery** |
| Countdown band | **partial** | `EventPhaseBanner` + `ApiStatus` sit in a bordered `statusCluster`; countdown renders only when the API returns `nextPhaseAt`; otherwise dev-facing "pending API" copy |
| Organizers band (2 logos) | **missing as a band** | Only compact marks in header (≥64rem) and footer (2.75rem). No full-width organizer section |
| Schedule timeline on swoosh curve | **missing** | Home shows 4 workflow cards; the real timeline is a flat bordered list on `/schedule` (`timelineItem`, border-top rows) |
| Two asymmetric challenge cards | **missing** | Two equal `auto-fit minmax(18rem)` cards, identical weight |
| 8-step path | **missing** | 4 cards here; `/schedule` has a 6-row progression table |
| Roles rows (participant / jury / admin) | **missing** | No mention of the three audiences anywhere on home |
| Final CTA | **missing** | Only a mid-page `outline` link to `/challenges`; no closing CTA band |
| Footer | **present** | Title, organizer marks, 4 links |

Phase/countdown source (do not edit): `EventPhaseBanner` → `api.events.getEventState()` → `EventStateResponse { phase, phaseLabel, nextPhaseAt, serverTime }`; rendered by `ServerCountdown({ serverTime, targetTime })`. The dashboard and submissions page pass `eventState.serverTime` / `history.deadline` into the same component.

Lenis/GSAP mounting: the home page is a Server Component rendering a static tree — mount a **new client wrapper** around the content inside `PageContainer` (`page.tsx:48`) or as a sibling of `styles.stack`, and clean up in that component's `useEffect` return (`lenis.destroy()`, `ScrollTrigger.getAll().forEach(t => t.kill())`, cancel `requestAnimationFrame`). Avoid `SiteHeader` (sticky + `backdrop-filter`, transform containment) and avoid animating `ServerCountdown`, `Stepper`, the QR image and the phase banner.

## 9. Recommended reskin order

| Phase | Work | Files |
|---|---|---|
| 1 | Tokens + fonts: `tokens.css`, `theme.css`, font loading in `app/layout.tsx` | 3 |
| 2 | Global shell: `globals.css`, `(public)/public.module.css`, `(auth)/auth.module.css`, `boundary.module.css`, header/footer/shell/container/brand/organizer (+ CSS) | ~12 |
| 3 | Primitives: button, card, badge, input, dialog, table, alert, state-panel, countdown, phase banner (+ CSS) | ~20 |
| 4 | Public pages: home, schedule, challenges | 4 |
| 5 | Auth + forms: login, registration, unauthorized, page wrappers | ~8 |
| 6 | Participant features: dashboard view, stepper, qr-pass, roster, ctf, challenge, submissions, announcements (+ CSS) | ~14 |
| 7 | Home motion layer (GSAP/Lenis client component) | 1–2 |
| 8 | Brand assets: organizer art / logo slots, favicon, `config/brand.ts` | 3–4 |

## 10. Questions for me

1. Is there an official LilTech event logo (and light/dark variants), or should the text wordmark stay as the hero lockup?
2. Do you have monochrome/cream versions of the GDG and ISITCom marks, or may I recolour the current full-colour artwork?
3. Light mode: drop `ThemeToggle` and go dark-only, or keep a working light theme?
4. Are `/jury`, `/admin`, `/checkin` implemented on another branch? The nav and sidebar link to them today.
5. Should `Card` become a filled/asymmetric surface, or keep the flat hairline look and get asymmetry only from page layouts?
6. Is Arabic (`Cairo`) needed for this reskin, or only as a numeral/latin fallback?
7. Home countdown band: should it show a static pre-event target before the live endpoint exists, or stay hidden?
8. Font delivery: self-host the webfonts, or is `next/font/google` (network fetch at build) acceptable?

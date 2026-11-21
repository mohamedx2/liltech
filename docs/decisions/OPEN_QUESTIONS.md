# Open Questions & Pending Decisions

> The LilTech specification leaves several business decisions open. **Do not invent answers to these questions in code, migrations, seeds, or docs.** Each item lists what is blocked on it.

| # | Question | Status | Blocks |
|---|---|---|---|
| 1 | How are teams assigned to a challenge track (two parallel challenges)? | ❓ Pending maintainer confirmation | Track assignment logic, challenge module |
| 2 | What is the Mini-CTF track structure — shared CTF for all teams, or per-track? | ❓ Pending | Mini-CTF module, flags storage |
| 3 | What are the leaderboard tie-break rules? | ❓ Pending | Scoring/leaderboard modules |
| 4 | What is the leaderboard visibility during the event (live to everyone, teams-only, jury-only)? | ❓ Pending | Leaderboard endpoints & UI |
| 5 | How are scores aggregated across jury members (mean, median, per-criterion weights)? | ✅ Resolved 2026-11-22: mean of the jurors' weighted totals; criteria weighted Solution 35 · Innovation 25 · Technique 25 · Pitching 15; final = CTF 10 pts + Challenge 1 20% + Challenge 2 70% | Scoring module, results publication |
| 6 | Which license applies to this repository? | ❓ Pending maintainer choice | `LICENSE` file, public release |
| 7 | Real-time transport (SSE vs WebSockets) for live updates | ❓ Pending (see `docs/architecture/overview.md`) | Real-time modules |
| 8 | Email delivery provider for QR badges | ❓ Pending | Registration/email module |

## How to Resolve an Item

1. Maintainers confirm the decision in the corresponding GitHub issue.
2. The decision is recorded here (and in the module's docs) with its date and rationale.
3. Only then is it implemented — never silently in a feature PR.

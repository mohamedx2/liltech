# AI Skills Setup — OpenCode

This repository ships a reproducible AI skill setup. Skills are **optional for building and running the project** — they assist contributors and AI coding agents with engineering and design work. See `AGENTS.md` for the skill selection guide.

## Installed Skill Systems

### 1. Matt Pocock Skills

TypeScript engineering skills: code review, domain modeling, TDD, debugging, spec writing, PR writing, codebase design.

- **Repository:** <https://github.com/mattpocock/skills>
- **Installed:** project-level, via the official Skills CLI
- **Location:** `.agents/skills/` (canonical, with `skills-lock.json`) — OpenCode picks them up automatically
- **Install command:**

  ```bash
  npx skills@latest add mattpocock/skills -a opencode
  ```

- **Update:** `npx skills@latest update -p`
- **Removed for relevance:** `scaffold-exercises`, `migrate-to-shoehorn`, `writing-beats`, `writing-fragments`, `writing-shape` (course-specific writing/exercise skills) and `claude-handoff`, `git-guardrails-claude-code` (Claude Code-specific).

### 2. Superpowers

Process skills: brainstorming, planning, test-driven development, systematic debugging, code review, verification before completion.

- **Repository:** <https://github.com/obra/superpowers>
- **Installed:** as an OpenCode **plugin** (user-level)
- **Configuration:** `~/.config/opencode/opencode.jsonc` (global user config, not committed)

  ```jsonc
  {
    "$schema": "https://opencode.ai/config.json",
    "plugins": ["superpowers@git+https://github.com/obra/superpowers.git"]
  }
  ```

  > Note: this uses the **plural `plugins` key** (OpenCode V2 schema). The singular `plugin` key is deprecated. The config is version-dependent — check the schema at <https://opencode.ai/config.json> if OpenCode complains.
- **Update:** OpenCode re-installs the plugin from the git URL on startup; pull the latest by restarting OpenCode or running `/reload`.
- **Verify:** open OpenCode and confirm process skills such as `brainstorming`, `systematic-debugging`, and `verification-before-completion` appear in the skill list.

### 3. UI UX Pro Max

Design intelligence: styles, palettes, font pairings, UX guidelines, chart types. Used as the primary design resource for all frontend work (see `AGENTS.md` §6).

- **Repository:** <https://github.com/nextlevelbuilder/ui-ux-pro-max-skill>
- **Installed:** project-level via the official CLI

  ```bash
  npx ui-ux-pro-max-cli init --ai opencode
  ```

- **Location:** `.opencode/skills/` (committed to the repository so every contributor gets the same design data)
- **Prerequisite:** some search functionality uses Python 3 — available on this machine (`python --version` ≥ 3.13); contributors without Python lose search but keep the core instructions.
- **Update:** re-run the CLI command above.
- **Verify:** ask your agent to "design a landing page" and confirm it consults `ui-ux-pro-max`.

### 4. Nx Skills

Nx workspace skills (`nx-generate`, `nx-run-tasks`, `nx-workspace`, …) installed automatically by `nx init` into `.opencode/skills/`. They keep agents on supported Nx workflows.

## For Contributors

1. Clone the repo — project-level skills (`.agents/skills/`, `.opencode/skills/`) come with it.
2. For Superpowers, add the plugin to your own global OpenCode config (see above) — this is intentional: it's a personal tool choice, not a project dependency.
3. Skills never gate CI or builds. Nothing in `package.json` scripts or workflows requires them.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Skills not visible in OpenCode | Run `/reload`, or restart OpenCode; check `opencode.json(c)` syntax. |
| Superpowers missing | Check the `plugins` entry in `~/.config/opencode/opencode.jsonc`; ensure you did not overwrite other settings. |
| Skills CLI asks about scope | Use `-y` (auto-detects project when run inside the repo). |
| Duplicate skill entries | Remove the extra copy from `.opencode/skills/` or `.agents/skills/` — keep one canonical source per system. |
| `skills-lock.json` conflicts | Re-run `npx skills experimental_install` to restore from the lockfile. |

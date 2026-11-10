# Changelog

All notable changes to the **LilTech 2026 Platform** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it reaches a release.

## [Unreleased]

### Added

- Repository initialization: Nx monorepo (pnpm) with `apps/web` (Next.js), `apps/api` (Express), and shared libraries (`libs/shared`, `libs/api-contracts`).
- PostgreSQL + Prisma foundation with Docker Compose.
- Quality tooling: ESLint, Prettier, TypeScript strict mode, Vitest, Husky, lint-staged, Conventional Commits.
- GitHub Actions CI, PR and issue templates, community health files.
- AI skills setup (Matt Pocock Skills, Superpowers, UI UX Pro Max) — see `docs/development/AI_SKILLS.md`.

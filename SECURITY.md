# Security Policy

The LilTech 2026 Platform handles personal participant data, authentication, and competition logic (including challenge answers). We take security seriously and ask you to report vulnerabilities responsibly.

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue for reports that include exploit details, attack steps, or event-sensitive information before maintainers can respond.**

To report a vulnerability **privately**, use GitHub's built-in mechanism:

- Open this repository on GitHub → **Security** tab → **Report a vulnerability** ([Private Vulnerability Reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)).

> **Note for maintainers:** no dedicated security email or contact address has been confirmed yet. Until one is agreed, the GitHub Private Vulnerability Reporting channel above is the only reporting channel. _Placeholders in this file must be replaced before public launch._

## What to Include

To help us understand and reproduce the issue quickly, please include:

- A clear description of the vulnerability and its impact.
- Step-by-step instructions (or a proof of concept) to reproduce it.
- The affected component — e.g. `apps/api`, `apps/web`, Docker compose setup, CI.
- Any relevant logs, requests, or responses (**redact secrets and personal data**).
- Your assessment of severity, if you have one.

## Our Commitment (Responsible Disclosure)

When you report a vulnerability we will:

1. Acknowledge your report and open a private tracking thread.
2. Investigate and work on a fix.
3. Coordinate a public disclosure with you once a fix is available or after a reasonable period.
4. Credit you in the disclosure — unless you prefer to remain anonymous.

Please give maintainers a reasonable amount of time to respond and release a fix before publicly discussing the issue or publishing exploit details.

## Scope

- In scope: this repository (`apps/web`, `apps/api`, `libs/*`, CI workflows, Docker setup) and the documented platform behavior.
- Out of scope: social engineering, physical attacks, denial-of-service attacks with excessive traffic volumes, and attacks against the venue infrastructure.

## Known Design Constraints

Some platform behavior is intentionally non-public in this repository:

- Mini-CTF flags and challenge answers are validated **only** server-side and must never appear in source code, migrations, seeds, or public API responses.
- Development credentials in `.env.example` are local-only examples and are not real secrets.

Reports that rely only on information contained in such files should be sent privately first.

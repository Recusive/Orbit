# Orbit Documentation

> **Last Updated:** January 2026

## Quick Links

| Need to...                     | Go to                                                            |
| ------------------------------ | ---------------------------------------------------------------- |
| Set up development environment | [development/DEVELOPMENT.md](development/DEVELOPMENT.md)         |
| Understand the tech stack      | [architecture/TECH-STACK.md](architecture/TECH-STACK.md)         |
| Fix a common issue             | [development/TROUBLESHOOTING.md](development/TROUBLESHOOTING.md) |
| Configure linting/formatting   | [quality/LINTING-AND-QUALITY.md](quality/LINTING-AND-QUALITY.md) |
| Build a DMG for macOS          | [development/DMG-BUILD-GUIDE.md](development/DMG-BUILD-GUIDE.md) |

---

## Documentation Structure

```text
docs/
├── README.md                         # This file - documentation index
│
├── architecture/                     # System design & technical details
│   ├── TECH-STACK.md
│   ├── EMBEDDED_BROWSER.md
│   ├── CSP-SECURITY.md
│   └── tauri-plugins.md
│
├── development/                      # Build & development workflow
│   ├── DEVELOPMENT.md
│   ├── TROUBLESHOOTING.md
│   ├── CI-CD-GUIDE.md
│   ├── DMG-BUILD-GUIDE.md
│   └── BUNDLING-TECHNICAL-NOTES.md
│
├── quality/                          # Code quality & audits
│   ├── LINTING-AND-QUALITY.md
│   ├── AUDIT-REPORT-2026-01-07.md
│   └── codebase-health.json
│
├── design/                           # UI/UX documentation
│   ├── TYPOGRAPHY.md
│   └── flash-prevention-guide.md
│
└── reference/                        # API & SDK references
    ├── Agent SDK reference - TypeScript.md
    └── codex-cli-guide.md
```

---

## By Category

### Architecture

Technical design decisions and implementation details.

| Document                                                | Description                                      |
| ------------------------------------------------------- | ------------------------------------------------ |
| [TECH-STACK.md](architecture/TECH-STACK.md)             | Complete technology overview                     |
| [EMBEDDED_BROWSER.md](architecture/EMBEDDED_BROWSER.md) | WebKit browser panel via Tauri multiwebview      |
| [CSP-SECURITY.md](architecture/CSP-SECURITY.md)         | Content Security Policy and `unsafe-eval` config |
| [tauri-plugins.md](architecture/tauri-plugins.md)       | Tauri 2 plugins reference                        |

### Development

Getting started, building, and CI/CD.

| Document                                                               | Description                    |
| ---------------------------------------------------------------------- | ------------------------------ |
| [DEVELOPMENT.md](development/DEVELOPMENT.md)                           | Development workflow and setup |
| [TROUBLESHOOTING.md](development/TROUBLESHOOTING.md)                   | Common issues and solutions    |
| [CI-CD-GUIDE.md](development/CI-CD-GUIDE.md)                           | GitHub Actions CI/CD pipeline  |
| [DMG-BUILD-GUIDE.md](development/DMG-BUILD-GUIDE.md)                   | Building macOS distributable   |
| [BUNDLING-TECHNICAL-NOTES.md](development/BUNDLING-TECHNICAL-NOTES.md) | Claude CLI bundling internals  |

### Quality

Code quality, linting, and audits.

| Document                                                         | Description                    |
| ---------------------------------------------------------------- | ------------------------------ |
| [LINTING-AND-QUALITY.md](quality/LINTING-AND-QUALITY.md)         | ESLint, Prettier, Clippy setup |
| [AUDIT-REPORT-2026-01-07.md](quality/AUDIT-REPORT-2026-01-07.md) | Pre-production code audit      |
| [codebase-health.json](quality/codebase-health.json)             | Automated health metrics       |

### Design

UI/UX guidelines and patterns.

| Document                                                      | Description                      |
| ------------------------------------------------------------- | -------------------------------- |
| [TYPOGRAPHY.md](design/TYPOGRAPHY.md)                         | Typography system (VS Code-like) |
| [flash-prevention-guide.md](design/flash-prevention-guide.md) | Preventing UI flash on load      |

### Reference

API documentation and SDK references.

| Document                                                                                     | Description                  |
| -------------------------------------------------------------------------------------------- | ---------------------------- |
| [Agent SDK reference - TypeScript.md](reference/Agent%20SDK%20reference%20-%20TypeScript.md) | Claude Agent SDK reference   |
| [codex-cli-guide.md](reference/codex-cli-guide.md)                                           | OpenAI Codex CLI usage guide |

---

## Contributing

When adding new documentation:

1. Place in the appropriate category folder
2. Use `UPPER-CASE.md` for guides (e.g., `DEVELOPMENT.md`, `CSP-SECURITY.md`)
3. For references, use descriptive names that match upstream sources (e.g., `Agent SDK reference - TypeScript.md`)
4. Add to this README's index
5. Update CLAUDE.md's Feature Documentation table if user-facing

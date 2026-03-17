# agent

> **Path:** `Agent-backend/.opencode/agent/`

## Purpose

Custom agent definitions for the OpenCode project. Each markdown file defines a specialized AI agent with its own system prompt, model selection, tool access, and behavioral rules. These agents are project-specific extensions loaded by the OpenCode runtime.

## Usage Status

| Product             | Status      | Notes                                                                                                 |
| ------------------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `reference` | Demonstrates the agent definition format — Orbit's `.orbit/agent/` directory follows the same pattern |
| Orbit CLI           | `reference` | Same — the CLI loads agents from `.orbit/agent/` using this format                                    |

## Files

| File              | Purpose                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs.md`         | Documentation writer agent — enforces concise style, section dividers, imperative headings, no semicolons in code snippets                              |
| `duplicate-pr.md` | PR deduplication agent — finds and closes duplicate PRs                                                                                                 |
| `translator.md`   | i18n translation agent — translates docs across 17 locales with glossary enforcement                                                                    |
| `triage.md`       | Issue triage agent — auto-labels and assigns GitHub issues based on ownership rules. Uses `minimax-m2.5` model, restricted to `github-triage` tool only |

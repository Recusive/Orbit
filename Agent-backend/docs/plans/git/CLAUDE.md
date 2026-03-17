# git

> **Path:** `Agent-backend/docs/plans/git/`

## Purpose

Git workflow documentation for managing the Orbit fork's relationship with the upstream opencode repository. Covers remote setup, branch strategy, and two sync approaches (tag merge and selective cherry-pick).

## Usage Status

| Product             | Status   | Notes                                                              |
| ------------------- | -------- | ------------------------------------------------------------------ |
| Orbit Desktop (SDK) | `active` | Upstream sync strategy directly affects how we receive SDK updates |
| Orbit CLI           | `active` | Same                                                               |

## Files

| File               | Purpose                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `upstream-sync.md` | Complete guide — remotes (`origin` = private fork, `upstream` = opencode), branches (`dev` mirrors upstream, `Orbit` for our changes), tag merge vs. selective cherry-pick workflows |

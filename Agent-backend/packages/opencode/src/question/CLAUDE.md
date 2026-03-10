# question

> **Path:** `Agent-backend/packages/opencode/src/question/`

## Purpose

Agent-to-user question system. When the agent needs clarification, it creates a structured question with options (multiple choice, custom input) and waits for user response. Questions are published via the event bus and answered through the API or TUI.

## Usage Status

| Product             | Status   | Notes                                                    |
| ------------------- | -------- | -------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Question prompts surfaced via SSE events to the frontend |
| Orbit CLI           | `active` | Interactive question prompts in the TUI                  |

## Key Files

| File       | Purpose                                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts` | `Question` namespace -- question schemas (Info, Request, Answer, Reply), `ask()` to create pending questions, `respond()` to answer, event bus integration |

# session/prompt

> **Path:** `Agent-backend/packages/opencode/src/session/prompt/`

## Purpose

System prompt template files for different LLM providers. Each `.txt` file contains the base system prompt that instructs the agent how to behave, what tools are available, and provider-specific formatting requirements. Selected at runtime based on the model being used.

## Usage Status

| Product             | Status   | Notes                                       |
| ------------------- | -------- | ------------------------------------------- |
| Orbit Desktop (SDK) | `active` | System prompts injected into every LLM call |
| Orbit CLI           | `active` | System prompts injected into every LLM call |

## Key Files

| File                          | Purpose                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `anthropic.txt`               | System prompt for Claude models                                |
| `anthropic-20250930.txt`      | Alternative Anthropic prompt variant                           |
| `beast.txt`                   | System prompt for OpenAI GPT/o1/o3 models                      |
| `gemini.txt`                  | System prompt for Google Gemini models                         |
| `codex_header.txt`            | Codex-style instruction header (used for GPT-5)                |
| `copilot-gpt-5.txt`           | Copilot-specific GPT-5 prompt                                  |
| `qwen.txt`                    | Fallback prompt for Qwen and other models without todo support |
| `trinity.txt`                 | System prompt for Trinity models                               |
| `plan.txt`                    | Plan mode prompt (read-only analysis)                          |
| `plan-reminder-anthropic.txt` | Plan mode reminder for Anthropic models                        |
| `build-switch.txt`            | Prompt for switching from plan to build mode                   |
| `max-steps.txt`               | Warning prompt when approaching max tool call steps            |

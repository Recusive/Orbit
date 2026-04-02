# Virtuoso Message List Scrollbar Jitter

## Question

Why does the scrollbar thumb visibly jump while fast-scrolling long conversations in `VirtuosoMessageList`, especially around assistant messages with tool widgets?

## Summary

The library behavior matched the earlier hypothesis only partially. `@virtuoso.dev/message-list` does re-measure rows and update its internal size tree while scrolling, but in this codebase the largest avoidable trigger was margin-based row spacing inside measured items.

Two code-level facts confirmed the problem:

1. The message-list wrapper disables browser scroll anchoring and owns scroll math itself, so CSS anchoring cannot mask height churn.
2. Our chat rows still used vertical margins in measured row wrappers and margin-driven stacks, which Virtuoso explicitly documents as a source of jumping lists because those margins are not part of the measured item box.

The implemented fix removes bottom-margin spacing from the virtual row wrapper, replaces margin-based assistant stacks with padding/gap, and makes markdown/tool roots establish their own formatting context so descendant margins stay inside the measured box.

## Detailed Flow

1. Library item positioning
   - `node_modules/@virtuoso.dev/message-list/dist/index.js:1571-1590`
   - Each rendered item is an absolutely positioned wrapper with `overflowAnchor: "none"`, `top: e.offset`, and `data-known-size`.
   - Implication: browser scroll anchoring is intentionally disabled for item rows.

2. Library size re-measurement
   - `node_modules/@virtuoso.dev/message-list/dist/index.js:2289-2294`
   - The list walks rendered children and compares `getBoundingClientRect().height` against `data-known-size`; any delta publishes a new size range.
   - Implication: any difference between visual row height and measured box height becomes a size-tree update, which changes list height during scroll.

3. Library list container anchoring
   - `node_modules/@virtuoso.dev/message-list/dist/index.js:2321-2329`
   - The main list container also uses `overflowAnchor: "none"`.
   - Implication: `overflow-anchor: auto` on our side would not address this path even if WKWebView supported it consistently.

4. Upstream Virtuoso guidance
   - `reference/react-virtuoso/packages/react-virtuoso/docs/6.troubleshooting.md:22-29`
   - Virtuoso’s own troubleshooting guide calls margins on items or item contents the common cause of jumping/misbehaving lists because measured size does not include margins.

5. Repo-specific row wrapper mismatch
   - Before fix, `apps/agent/src/components/chat/chat-messages.tsx` wrapped each item with `mb-3`.
   - After fix: `apps/agent/src/components/chat/chat-messages.tsx:102-121`
   - The row wrapper now uses padding (`pb-3` / `pb-11`) instead of `mb-3`.
   - Implication: row spacing is now inside the measured item height instead of outside it.

6. Repo-specific assistant stack mismatch
   - `apps/agent/src/components/chat/messages/MessageItem.tsx:362-443`
   - Assistant rows now use `flex flex-col gap-2`, `py-1`, and a `flex flex-col gap-2` segment stack instead of `space-y-*` and `my-1`.
   - Implication: assistant content/tool spacing is driven by in-box layout rather than margins that can drift from measured height.

7. Markdown and tool formatting contexts
   - `apps/agent/src/globals.css:854-863`
   - `.chat-markdown` and `.tool-widget` now use `display: flow-root`.
   - Implication: descendant block margins from markdown content and widget internals stay inside a formatting context, which keeps measured height closer to rendered height.

## Key Observations

- `VirtuosoMessageList` does not expose `heightEstimates`, `minOverscanItemCount`, or `skipAnimationFrameInResizeObserver` in its public prop surface here, so the cleanest fix had to be on our DOM/layout side rather than a raw `react-virtuoso` tuning prop.
- The biggest repo-specific offender was not generic “variable tool height” alone; it was variable height plus spacing rendered outside the measured row box.
- The existing `contain: layout style` wrapper helped isolate layout work, but it did not make an external bottom margin (`mb-3`) measurable by the parent virtual row.

## Implemented Fix

- Convert virtual row bottom spacing from margin to padding.
- Replace assistant margin stacks with flex gaps and padding.
- Establish flow-root formatting contexts for markdown/tool roots.
- Add regression coverage:
  - `apps/agent/src/__tests__/unit/components/chat/chat-messages.test.tsx:625-648`
  - `apps/agent/src/__tests__/components/chat/messages/message-item-action-bar.test.tsx:117-142`

## Implications

- This does not remove all future scrollbar movement; genuinely unknown item heights can still change the total list height when first measured.
- It does remove the avoidable height drift caused by our own spacing model, which was forcing extra list-height corrections on top of normal virtualization measurement.
- If residual jitter remains after this, the next step should be message/tool height caching or wrapper-level premeasurement, not larger `increaseViewportBy`.

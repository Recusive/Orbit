import type { DemoScript } from '@/demo/types';

export const launchVideoScript: DemoScript = {
  name: 'Launch Video Demo',
  steps: [
    { action: 'showCursor' },

    // ── Act 1: Chat ──
    { action: 'label', text: 'Act 1: Send message and wait for response' },
    { action: 'sendMessage', text: 'Write a launch announcement for Orbit.', charDelay: 36 },
    { action: 'waitForAgent', timeout: 120_000 },
    { action: 'wait', ms: 1_200 },

    // ── Act 2: Explorer ──
    { action: 'label', text: 'Act 2: Switch to file explorer' },
    { action: 'click', target: '[aria-label="Toggle Sessions / Explorer"]', dispatch: true },
    { action: 'wait', ms: 600 },
    { action: 'click', target: '.file-tree-item[title*="CLAUDE.md"]', dispatch: true },
    { action: 'wait', ms: 300 },
    { action: 'togglePanel', panel: 'files' },
    { action: 'wait', ms: 1_000 },

    // ── Act 3: Source Control ──
    { action: 'label', text: 'Act 3: Source control and diffs' },
    { action: 'togglePanel', panel: 'sourceControl' },
    { action: 'wait', ms: 800 },
    // Expand a diff card — try CLAUDE.md first, fall back to first available
    { action: 'click', target: '[aria-label="Expand diff for CLAUDE.md"]', dispatch: true },
    { action: 'wait', ms: 1_500 },
    // Collapse it (expanded cards use "Collapse diff for ..." aria-label)
    { action: 'click', target: '[aria-label^="Collapse diff for"]', dispatch: true },
    { action: 'wait', ms: 600 },

    // ── Act 4: Back to Sessions ──
    { action: 'label', text: 'Act 4: Back to sessions' },
    { action: 'click', target: '[aria-label="Toggle Sessions / Explorer"]', dispatch: true },
    { action: 'wait', ms: 600 },
    { action: 'togglePanel', panel: 'activity', state: 'closed' },
    { action: 'wait', ms: 400 },

    // ── Act 5: Vault ──
    { action: 'label', text: 'Act 5: Open vault and edit note' },
    { action: 'togglePanel', panel: 'vault' },
    { action: 'wait', ms: 800 },
    { action: 'click', target: 'button[title*="CLAUDE"]', dispatch: true },
    { action: 'wait', ms: 1_500 },
    // Type into the Milkdown ProseMirror editor
    {
      action: 'typeInto',
      target: '.vault-editor-shell .ProseMirror',
      text: '\n\nOrbit Launch Notes',
      charDelay: 40,
    },
    { action: 'wait', ms: 300 },
    // Select all text in the editor (Cmd+A) then bold it (Cmd+B)
    { action: 'keyCombo', keys: 'cmd+a', target: '.vault-editor-shell .ProseMirror' },
    { action: 'wait', ms: 400 },
    { action: 'keyCombo', keys: 'cmd+b', target: '.vault-editor-shell .ProseMirror' },
    { action: 'wait', ms: 1_000 },
    // Undo the bold to leave the note clean
    { action: 'keyCombo', keys: 'cmd+z', target: '.vault-editor-shell .ProseMirror' },
    { action: 'wait', ms: 300 },
    { action: 'keyCombo', keys: 'cmd+z', target: '.vault-editor-shell .ProseMirror' },
    { action: 'wait', ms: 600 },

    // ── Act 6: Exit Vault ──
    { action: 'label', text: 'Act 6: Exit vault' },
    { action: 'click', target: '[aria-label="Go back"]', dispatch: true },
    { action: 'wait', ms: 600 },

    // ── Act 7: Terminal ──
    // Click the actual header button — its handler sets terminalPosition
    // (which slot to render in) AND toggles the panel. The programmatic
    // togglePanel only does the latter, which is why the terminal was silent.
    { action: 'label', text: 'Act 7: Terminal' },
    { action: 'click', target: 'button[aria-label="Show Terminal"]', dispatch: true },
    // terminalType polls internally for PTY connection (up to 10s)
    { action: 'wait', ms: 500 },
    { action: 'terminalType', text: 'git status', charDelay: 70 },
    { action: 'wait', ms: 2_000 },

    // ── Act 8: Close and end ──
    { action: 'label', text: 'Act 8: Close terminal and finish' },
    { action: 'click', target: 'button[aria-label="Hide Terminal"]', dispatch: true },
    { action: 'wait', ms: 600 },

    { action: 'hideCursor' },
    { action: 'label', text: 'Demo complete' },
  ],
};

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { stripRewindPollution } from '../agent/session/session-manager.js';

/**
 * Helper: build a JSONL string from an array of objects.
 */
function toJsonl(entries: Record<string, unknown>[]): string {
  return entries.map((e) => JSON.stringify(e)).join('\n');
}

/**
 * Helper: parse JSONL back into objects.
 */
function fromJsonl(content: string): Record<string, unknown>[] {
  return content
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe('stripRewindPollution (chain-safe)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-strip-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeJsonl(name: string, entries: Record<string, unknown>[]): string {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, toJsonl(entries), 'utf-8');
    return filePath;
  }

  it('re-parents children when stripping an empty user message', () => {
    // Exact scenario from the bug:
    // msg1 → msg2 → msg3 → [empty-user: 02a1] → [interrupt, parent: 02a1] → ...
    // After strip: interrupt's parentUuid should point to msg3's uuid.
    const entries = [
      {
        type: 'user',
        uuid: 'msg-1',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
      {
        type: 'assistant',
        uuid: 'msg-2',
        parentUuid: 'msg-1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hi!' }] },
      },
      {
        type: 'user',
        uuid: 'msg-3',
        parentUuid: 'msg-2',
        message: { role: 'user', content: [{ type: 'text', text: 'Second message' }] },
      },
      {
        type: 'assistant',
        uuid: 'msg-4',
        parentUuid: 'msg-3',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Response 2' }] },
      },
      // rewindFiles pollution: empty user message
      {
        type: 'user',
        uuid: 'empty-user-1',
        parentUuid: 'msg-4',
        message: { content: [{ type: 'text', text: '' }] },
      },
      // interrupt marker whose parentUuid points to the empty user
      {
        type: 'user',
        uuid: 'interrupt-1',
        parentUuid: 'empty-user-1',
        message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] },
      },
      {
        type: 'assistant',
        uuid: 'msg-5',
        parentUuid: 'interrupt-1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'No response requested.' }] },
      },
    ];

    const filePath = writeJsonl('test.jsonl', entries);
    const stripped = stripRewindPollution(filePath);

    expect(stripped).toBe(1);

    const result = fromJsonl(fs.readFileSync(filePath, 'utf-8'));
    expect(result).toHaveLength(6); // 7 - 1 stripped

    // The interrupt marker (was line 5) should now have parentUuid → msg-4
    const interruptEntry = result.find((e) => e.uuid === 'interrupt-1');
    expect(interruptEntry).toBeDefined();
    expect(interruptEntry?.parentUuid).toBe('msg-4');

    // msg-5's parentUuid should be unchanged (still interrupt-1)
    const msg5 = result.find((e) => e.uuid === 'msg-5');
    expect(msg5).toBeDefined();
    expect(msg5?.parentUuid).toBe('interrupt-1');
  });

  it('handles consecutive empty user messages (chain of removals)', () => {
    // Two back-to-back empty user messages — child should skip both
    const entries = [
      {
        type: 'assistant',
        uuid: 'a1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
      },
      {
        type: 'user',
        uuid: 'empty-1',
        parentUuid: 'a1',
        message: { content: [{ type: 'text', text: '' }] },
      },
      {
        type: 'user',
        uuid: 'empty-2',
        parentUuid: 'empty-1',
        message: { content: [{ type: 'text', text: '' }] },
      },
      {
        type: 'user',
        uuid: 'real-msg',
        parentUuid: 'empty-2',
        message: { content: [{ type: 'text', text: 'Real message' }] },
      },
    ];

    const filePath = writeJsonl('chain.jsonl', entries);
    const stripped = stripRewindPollution(filePath);

    expect(stripped).toBe(2);

    const result = fromJsonl(fs.readFileSync(filePath, 'utf-8'));
    expect(result).toHaveLength(2);

    // real-msg should have walked up the chain: empty-2 → empty-1 → a1
    const realMsg = result.find((e) => e.uuid === 'real-msg');
    expect(realMsg).toBeDefined();
    expect(realMsg?.parentUuid).toBe('a1');
  });

  it('does nothing when no empty user messages exist', () => {
    const entries = [
      {
        type: 'user',
        uuid: 'u1',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
      {
        type: 'assistant',
        uuid: 'a1',
        parentUuid: 'u1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
      },
    ];

    const filePath = writeJsonl('clean.jsonl', entries);
    const stripped = stripRewindPollution(filePath);

    expect(stripped).toBe(0);

    // File should be unchanged
    const result = fromJsonl(fs.readFileSync(filePath, 'utf-8'));
    expect(result).toHaveLength(2);
  });

  it('preserves non-message entries (queue-operation, file-history-snapshot)', () => {
    const entries = [
      {
        type: 'user',
        uuid: 'u1',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
      { type: 'queue-operation', operation: 'enqueue' },
      { type: 'file-history-snapshot', messageId: 'u1', snapshot: {} },
      // pollution
      {
        type: 'user',
        uuid: 'empty-1',
        parentUuid: 'u1',
        message: { content: [{ type: 'text', text: '' }] },
      },
      // child of pollution
      {
        type: 'user',
        uuid: 'interrupt',
        parentUuid: 'empty-1',
        message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] },
      },
    ];

    const filePath = writeJsonl('mixed.jsonl', entries);
    const stripped = stripRewindPollution(filePath);

    expect(stripped).toBe(1);

    const result = fromJsonl(fs.readFileSync(filePath, 'utf-8'));
    expect(result).toHaveLength(4);

    // Non-message entries preserved
    expect(result.find((e) => e.type === 'queue-operation')).toBeDefined();
    expect(result.find((e) => e.type === 'file-history-snapshot')).toBeDefined();

    // Interrupt re-parented to u1
    const interrupt = result.find((e) => e.uuid === 'interrupt');
    expect(interrupt).toBeDefined();
    expect(interrupt?.parentUuid).toBe('u1');
  });

  it('handles empty user message with no uuid gracefully (no strip)', () => {
    // If an empty user message somehow has no uuid, it can't be chain-stripped
    // safely (we don't know what to re-parent to), so it should be left alone.
    const entries = [
      {
        type: 'user',
        uuid: 'u1',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
      { type: 'user', message: { content: [{ type: 'text', text: '' }] } }, // no uuid
    ];

    const filePath = writeJsonl('no-uuid.jsonl', entries);
    const stripped = stripRewindPollution(filePath);

    expect(stripped).toBe(0);

    const result = fromJsonl(fs.readFileSync(filePath, 'utf-8'));
    expect(result).toHaveLength(2);
  });

  it('handles multiple children of the same removed parent', () => {
    // A removed node has two children — both should be re-parented
    const entries = [
      {
        type: 'assistant',
        uuid: 'a1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
      },
      {
        type: 'user',
        uuid: 'empty-1',
        parentUuid: 'a1',
        message: { content: [{ type: 'text', text: '' }] },
      },
      {
        type: 'user',
        uuid: 'child-1',
        parentUuid: 'empty-1',
        message: { content: [{ type: 'text', text: 'Branch A' }] },
      },
      {
        type: 'user',
        uuid: 'child-2',
        parentUuid: 'empty-1',
        message: { content: [{ type: 'text', text: 'Branch B' }] },
      },
    ];

    const filePath = writeJsonl('multi-child.jsonl', entries);
    const stripped = stripRewindPollution(filePath);

    expect(stripped).toBe(1);

    const result = fromJsonl(fs.readFileSync(filePath, 'utf-8'));
    expect(result).toHaveLength(3);

    // Both children re-parented to a1
    const child1 = result.find((e) => e.uuid === 'child-1');
    const child2 = result.find((e) => e.uuid === 'child-2');
    expect(child1).toBeDefined();
    expect(child2).toBeDefined();
    expect(child1?.parentUuid).toBe('a1');
    expect(child2?.parentUuid).toBe('a1');
  });

  it('returns 0 for non-existent file', () => {
    const stripped = stripRewindPollution(path.join(tmpDir, 'nonexistent.jsonl'));
    expect(stripped).toBe(0);
  });

  it('reproduces the exact OG-session-after-rewind scenario', () => {
    // Full scenario: 3 messages → rewind to #2 → fork → return OG → send message
    // The JSONL for the OG session looks like this after rewindFiles pollutes it:
    const entries = [
      // system:init (first session start)
      { type: 'system', uuid: 'sys-init', message: { role: 'system', content: 'System prompt' } },
      // Message 1
      {
        type: 'user',
        uuid: 'user-1',
        parentUuid: 'sys-init',
        message: { role: 'user', content: [{ type: 'text', text: 'Message 1' }] },
      },
      {
        type: 'assistant',
        uuid: 'asst-1',
        parentUuid: 'user-1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Reply 1' }] },
      },
      // Message 2
      {
        type: 'user',
        uuid: 'user-2',
        parentUuid: 'asst-1',
        message: { role: 'user', content: [{ type: 'text', text: 'Message 2' }] },
      },
      {
        type: 'assistant',
        uuid: 'asst-2',
        parentUuid: 'user-2',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Reply 2' }] },
      },
      // Message 3
      {
        type: 'user',
        uuid: 'user-3',
        parentUuid: 'asst-2',
        message: { role: 'user', content: [{ type: 'text', text: 'Message 3' }] },
      },
      {
        type: 'assistant',
        uuid: 'asst-3',
        parentUuid: 'user-3',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Reply 3' }] },
      },

      // === rewindFiles pollution starts here ===
      // file-history-snapshot (points to the empty user message that follows)
      { type: 'file-history-snapshot', messageId: 'rewind-empty-user', snapshot: { files: {} } },
      // Empty user message — THE POLLUTION
      {
        type: 'user',
        uuid: 'rewind-empty-user',
        parentUuid: 'asst-3',
        message: { content: [{ type: 'text', text: '' }] },
      },
      // Interrupt marker — child of the empty user
      {
        type: 'user',
        uuid: 'interrupt-marker',
        parentUuid: 'rewind-empty-user',
        message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] },
      },
      // Assistant "No response requested."
      {
        type: 'assistant',
        uuid: 'asst-noop',
        parentUuid: 'interrupt-marker',
        message: { role: 'assistant', content: [{ type: 'text', text: 'No response requested.' }] },
      },
    ];

    const filePath = writeJsonl('og-session.jsonl', entries);
    const stripped = stripRewindPollution(filePath);

    expect(stripped).toBe(1);

    const result = fromJsonl(fs.readFileSync(filePath, 'utf-8'));
    expect(result).toHaveLength(10); // 11 - 1 stripped

    // Critical assertion: the interrupt marker's parentUuid now points to asst-3,
    // NOT to the deleted rewind-empty-user. This preserves the chain so
    // build_active_uuid_set() can walk all the way back to sys-init.
    const interruptMarker = result.find((e) => e.uuid === 'interrupt-marker');
    expect(interruptMarker).toBeDefined();
    expect(interruptMarker?.parentUuid).toBe('asst-3');

    // Walk the full chain from tail to head — must reach sys-init
    const byUuid = new Map(result.filter((e) => e.uuid).map((e) => [e.uuid as string, e]));
    const activeSet = new Set<string>();
    let current: string | undefined = 'asst-noop'; // tail
    while (current) {
      activeSet.add(current);
      const entry = byUuid.get(current);
      current = entry?.parentUuid as string | undefined;
    }

    // All original messages must be reachable
    expect(activeSet.has('asst-noop')).toBe(true);
    expect(activeSet.has('interrupt-marker')).toBe(true);
    expect(activeSet.has('asst-3')).toBe(true);
    expect(activeSet.has('user-3')).toBe(true);
    expect(activeSet.has('asst-2')).toBe(true);
    expect(activeSet.has('user-2')).toBe(true);
    expect(activeSet.has('asst-1')).toBe(true);
    expect(activeSet.has('user-1')).toBe(true);
    expect(activeSet.has('sys-init')).toBe(true);
  });
});

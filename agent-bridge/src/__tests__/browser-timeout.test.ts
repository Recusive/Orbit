import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { BrowserToolBridge, getBrowserToolTimeoutMs } from '../browser/browser-tool-bridge.js';

describe('Browser tool bridge timeouts', () => {
  let bridge: BrowserToolBridge;

  beforeEach(() => {
    bridge = new BrowserToolBridge();
  });

  afterEach(() => {
    bridge.dispose();
  });

  async function expectTimeout(request: Promise<unknown>, message: string): Promise<void> {
    try {
      await request;
      throw new Error(`Expected request to reject with: ${message}`);
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      expect(error.message).toBe(message);
    }
  }

  it('returns the 15s timeout budget for browser_snapshot', () => {
    expect(getBrowserToolTimeoutMs('browser_snapshot', {})).toBe(15000);
  });

  it('returns the 10s timeout budget for browser_click', () => {
    expect(getBrowserToolTimeoutMs('browser_click', { ref: 'e1' })).toBe(10000);
  });

  it('returns the 30s timeout budget for browser_navigate', () => {
    expect(getBrowserToolTimeoutMs('browser_navigate', { url: 'https://example.com' })).toBe(30000);
  });

  it('uses the configured timeout for browser_wait_for_selector', () => {
    expect(
      getBrowserToolTimeoutMs('browser_wait_for_selector', {
        selector: '#ready',
        state: 'visible',
        timeout: 42000,
      })
    ).toBe(42000);
  });

  it('clamps browser_wait_for_url timeout at 120s', () => {
    expect(
      getBrowserToolTimeoutMs('browser_wait_for_url', {
        url: '/dashboard/i',
        timeout: 999999,
      })
    ).toBe(120000);
  });

  it('rejects with the tool name and elapsed time when a short wait request times out', async () => {
    bridge.onToolRequest(() => {
      // Intentionally never responds.
    });

    await expectTimeout(
      bridge.sendRequest('browser_wait_for_selector', {
        selector: '#ready',
        timeout: 25,
      }),
      'browser_wait_for_selector timed out after 25ms'
    );
  });
});

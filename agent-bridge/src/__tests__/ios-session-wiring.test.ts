import { afterEach, describe, expect, it, jest } from 'bun:test';

import { OrbitAgent } from '../agent/core/agent.js';
import { SessionManager } from '../agent/session/session-manager.js';
import { createIOSMcpServer } from '../ios/ios-mcp-server.js';

import type { IOSService } from '../ios/ios-service.js';
import type { Options } from '@anthropic-ai/claude-agent-sdk';

interface StartSessionContext {
  _mcpServers: Record<string, unknown>;
}

function getSystemPromptAppend(agent: OrbitAgent): string {
  const options = (agent as unknown as { _createOptions(): Options })._createOptions();
  const systemPrompt = options.systemPrompt;
  if (
    systemPrompt === undefined ||
    typeof systemPrompt === 'string' ||
    systemPrompt.type !== 'preset'
  ) {
    throw new Error('Expected preset system prompt');
  }
  return systemPrompt.append ?? '';
}

describe('iOS session wiring', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockSessionLifecycle(): ReturnType<typeof jest.spyOn> {
    return jest
      .spyOn(
        SessionManager.prototype as unknown as {
          _startBackgroundConsumer(sessionId: string, agent: OrbitAgent): void;
        },
        '_startBackgroundConsumer'
      )
      .mockImplementation((): void => undefined);
  }

  it('adds the orbit-ios MCP server to new sessions when an iOS service is available', async () => {
    const capturedServerKeys: string[][] = [];
    const startSessionSpy = jest
      .spyOn(OrbitAgent.prototype, 'startSession')
      .mockImplementation(function (this: StartSessionContext): Promise<void> {
        capturedServerKeys.push(Object.keys(this._mcpServers));
        return Promise.resolve();
      });
    const backgroundConsumerSpy = mockSessionLifecycle();

    const manager = new SessionManager({ iosService: {} as IOSService });
    await manager.createSession('session-with-ios');

    expect(startSessionSpy).toHaveBeenCalledTimes(1);
    expect(backgroundConsumerSpy).toHaveBeenCalledTimes(1);
    expect(capturedServerKeys).toEqual([['orbit-ios', 'orbit-browser']]);
  });

  it('does not add the orbit-ios MCP server when iOS is unavailable', async () => {
    const capturedServerKeys: string[][] = [];
    const startSessionSpy = jest
      .spyOn(OrbitAgent.prototype, 'startSession')
      .mockImplementation(function (this: StartSessionContext): Promise<void> {
        capturedServerKeys.push(Object.keys(this._mcpServers));
        return Promise.resolve();
      });
    mockSessionLifecycle();

    const manager = new SessionManager();
    await manager.createSession('session-without-ios');

    expect(startSessionSpy).toHaveBeenCalledTimes(1);
    expect(capturedServerKeys).toEqual([['orbit-browser']]);
  });

  it('only appends iOS workflow guidance when the orbit-ios MCP server is configured', () => {
    const iosAgent = new OrbitAgent({
      mcpServers: {
        'orbit-ios': createIOSMcpServer({} as IOSService, 'ios-session'),
      },
    });
    const browserOnlyAgent = new OrbitAgent();

    const iosPrompt = getSystemPromptAppend(iosAgent);
    const browserOnlyPrompt = getSystemPromptAppend(browserOnlyAgent);

    expect(iosPrompt).toContain('mcp__orbit-ios__ios_launch');
    expect(iosPrompt).toContain('mcp__orbit-ios__ios_close');
    expect(browserOnlyPrompt).not.toContain('mcp__orbit-ios__ios_launch');
  });

  it('force releases the iOS lease when a session is deleted', async () => {
    const forceRelease = jest.fn(() => Promise.resolve());
    jest.spyOn(OrbitAgent.prototype, 'startSession').mockImplementation(() => Promise.resolve());
    jest.spyOn(OrbitAgent.prototype, 'stopSession').mockImplementation(() => Promise.resolve());
    mockSessionLifecycle();

    const manager = new SessionManager({
      iosService: {
        forceRelease,
      } as unknown as IOSService,
    });

    await manager.createSession('session-to-delete');
    await manager.deleteSession('session-to-delete');

    expect(forceRelease).toHaveBeenCalledTimes(1);
    expect(forceRelease).toHaveBeenCalledWith('session-to-delete');
  });
});

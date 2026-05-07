import { describe, expect, it } from 'bun:test';

import { OrbitAgent, createAgent } from '../agent.js';
import { BridgeRequestSchema } from '../schemas.js';

describe('root agent-bridge exports', () => {
  it('exports the bridge request schema from the root schemas module', () => {
    const parsed = BridgeRequestSchema.safeParse({ type: 'shutdown' });

    expect(parsed.success).toBe(true);
  });

  it('exports the agent constructor and factory from the root agent module', () => {
    expect(typeof OrbitAgent).toBe('function');
    expect(typeof createAgent).toBe('function');
  });
});

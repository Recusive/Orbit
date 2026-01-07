/*---------------------------------------------------------------------------------------------
 *  Agents - Barrel export for specialized canvas agents
 *--------------------------------------------------------------------------------------------*/

// Base agent
export { BaseAgent } from './base-agent.js';
export type { AgentConfig, AgentEvents } from './base-agent.js';
export {
  getAgentInstance,
  registerAgentInstance,
  unregisterAgentInstance,
  clearAgentInstances,
} from './base-agent.js';

// Specialized agents
export { LayoutAgent, createLayoutAgent } from './layout-agent.js';
export { ComponentAgent, createComponentAgent } from './component-agent.js';
export { StyleAgent, createStyleAgent } from './style-agent.js';
export { IntegrationAgent, createIntegrationAgent } from './integration-agent.js';

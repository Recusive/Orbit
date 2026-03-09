/**
 * Demo Scenario Registry
 *
 * Each scenario is a function that returns a DemoScript — a timed sequence
 * of backend messages that simulate a real AI conversation.
 * Selected via ?scenario=X query param.
 */
import { buildAuthScript } from './auth';
import { buildBashScript } from './bash';
import { buildBrowserScript } from './browser';
import { buildClawdbotScript } from './clawdbot';
import { buildPrReviewScript } from './pr-review';
import { buildSkillsScript } from './skills';

import type { DemoScript } from './types';

// Re-export types and constants from shared types module
export type { DemoEvent, DemoScript } from './types';
export { DEMO_SESSION_ID } from './types';

// ============================================
// Registry
// ============================================

type ScenarioBuilder = () => DemoScript;

const SCENARIO_REGISTRY: Record<string, ScenarioBuilder> = {
  clawdbot: buildClawdbotScript,
  auth: buildAuthScript,
  browser: buildBrowserScript,
  bash: buildBashScript,
  skills: buildSkillsScript,
  'pr-review': buildPrReviewScript,
};

/** Look up a scenario by key. Returns undefined if not found. */
export function getScenario(key: string): DemoScript | undefined {
  const builder = SCENARIO_REGISTRY[key];
  return builder ? builder() : undefined;
}

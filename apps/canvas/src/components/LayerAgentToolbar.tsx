/**
 * LayerAgentToolbar - Floating AI skill buttons for selected nodes
 *
 * Appears above selected SandpackNodes and provides quick access to
 * AI-powered design actions: Refine, Fix A11y, Animate, Variations
 */

import { NodeToolbar, Position } from '@xyflow/react';
import React, { useCallback, useState } from 'react';

import { AGENT_SKILLS, buildSkillPrompt } from '../config/agentSkills';

import type { AgentSkill } from '../config/agentSkills';
import './LayerAgentToolbar.css';

// Icons
const RefineIcon = (): React.JSX.Element => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3l1.912 5.813L20 12l-6.088 3.187L12 21l-1.912-5.813L4 12l6.088-3.187L12 3z"></path>
  </svg>
);

const AccessibilityIcon = (): React.JSX.Element => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const AnimateIcon = (): React.JSX.Element => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
  </svg>
);

const VariationsIcon = (): React.JSX.Element => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="7" height="7" rx="1"></rect>
    <rect x="14" y="3" width="7" height="7" rx="1"></rect>
    <rect x="14" y="14" width="7" height="7" rx="1"></rect>
    <rect x="3" y="14" width="7" height="7" rx="1"></rect>
  </svg>
);

const SKILL_ICONS: Record<string, React.FC> = {
  refine: RefineIcon,
  accessibility: AccessibilityIcon,
  interactive: AnimateIcon,
  variations: VariationsIcon,
};

export interface LayerAgentToolbarProps {
  nodeId: string;
  label: string;
  code: string;
  isVisible: boolean;
  onSkillActivate: (skillId: string, prompt: string) => void;
}

export function LayerAgentToolbar({
  nodeId,
  label,
  code,
  isVisible,
  onSkillActivate,
}: LayerAgentToolbarProps): React.JSX.Element | null {
  const [loadingSkill, setLoadingSkill] = useState<string | null>(null);

  const handleSkillClick = useCallback(
    (skill: AgentSkill) => {
      if (loadingSkill) return; // Prevent double-clicks

      setLoadingSkill(skill.id);

      // Build the contextual prompt
      const prompt = buildSkillPrompt(skill, { nodeId, label, code });

      // Trigger the skill activation
      onSkillActivate(skill.id, prompt);

      // Reset loading state after a short delay
      // (The actual completion will be handled by the chat response)
      setTimeout(() => {
        setLoadingSkill(null);
      }, 500);
    },
    [nodeId, label, code, loadingSkill, onSkillActivate]
  );

  // Early return AFTER all hooks
  if (!isVisible) return null;

  return (
    <NodeToolbar isVisible={isVisible} position={Position.Top} offset={12} align="center">
      <div className="layer-agent-toolbar">
        {AGENT_SKILLS.map((skill) => {
          const Icon = SKILL_ICONS[skill.id] ?? (() => null);

          return (
            <button
              key={skill.id}
              className={`layer-agent-toolbar__button ${loadingSkill === skill.id ? 'layer-agent-toolbar__button--loading' : ''}`}
              data-skill={skill.id}
              onClick={() => {
                handleSkillClick(skill);
              }}
              title={skill.description}
              disabled={loadingSkill !== null}
            >
              {loadingSkill === skill.id ? (
                <div
                  className="layer-agent-toolbar__spinner"
                  style={{ borderTopColor: skill.color }}
                />
              ) : (
                <span className="layer-agent-toolbar__icon">
                  <Icon />
                </span>
              )}
              <span className="layer-agent-toolbar__label">{skill.name}</span>
            </button>
          );
        })}
      </div>
    </NodeToolbar>
  );
}

export default LayerAgentToolbar;

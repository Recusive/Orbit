/**
 * MissionsFloatingToolbar
 * Floating toolbar for missions mode - add agents, run mission
 */

import { FlaskConical } from 'lucide-react';
import React, { useCallback, useRef, useState } from 'react';

import { useMissionsStore } from '../stores';

import type { AgentStatus } from '../types';

import './MissionsFloatingToolbar.css';

// ============================================================================
// Icons
// ============================================================================

function PlayIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function StopIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" />
    </svg>
  );
}

function PlusIcon(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// ============================================================================
// Component
// ============================================================================

interface MissionsFloatingToolbarProps {
  readonly onAddAgent?: () => void;
}

// Demo: cycle through all agent states to preview the card design
const DEMO_STATES: AgentStatus[] = ['idle', 'pending', 'running', 'streaming', 'complete', 'error'];
const DEMO_INTERVAL_MS = 1500;

export function MissionsFloatingToolbar({
  onAddAgent,
}: MissionsFloatingToolbarProps): React.JSX.Element {
  const activeMission = useMissionsStore((s) => s.activeMission);
  const agents = useMissionsStore((s) => s.agents);
  const startMissionRun = useMissionsStore((s) => s.startMissionRun);
  const completeMissionRun = useMissionsStore((s) => s.completeMissionRun);
  const addAgent = useMissionsStore((s) => s.addAgent);
  const setAgentStatus = useMissionsStore((s) => s.setAgentStatus);
  const updateAgent = useMissionsStore((s) => s.updateAgent);

  const isRunning = activeMission?.status === 'running';
  const agentCount = Object.keys(agents).length;

  // Demo state
  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [demoStateIndex, setDemoStateIndex] = useState(0);
  const demoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const demoAgentIdRef = useRef<string | null>(null);

  const handleRunClick = useCallback(() => {
    if (isRunning) {
      // Stop the mission
      completeMissionRun('failed', 'Stopped by user');
    } else {
      // Start the mission
      startMissionRun();
    }
  }, [isRunning, startMissionRun, completeMissionRun]);

  const handleAddClick = useCallback(() => {
    onAddAgent?.();
  }, [onAddAgent]);

  // Demo button handler: cycles an agent through all states
  const handleDemoClick = useCallback(() => {
    if (isDemoRunning) {
      // Stop the demo
      if (demoIntervalRef.current !== null) {
        clearInterval(demoIntervalRef.current);
        demoIntervalRef.current = null;
      }
      setIsDemoRunning(false);
      setDemoStateIndex(0);
      return;
    }

    // Get or create a demo agent
    const agentIds = Object.keys(agents);
    let agentId: string;

    const firstAgentId = agentIds[0];
    if (firstAgentId === undefined) {
      // Create a demo agent
      const newAgent = addAgent({
        id: `demo-agent-${String(Date.now())}`,
        createdBy: 'demo',
        position: { x: 300, y: 200 },
        name: 'Demo Agent',
        prompt: 'Implement user authentication',
      });
      agentId = newAgent.id;
    } else {
      // Use the first agent
      agentId = firstAgentId;
    }

    demoAgentIdRef.current = agentId;

    // Add a demo activity log entry for running states
    const existingAgent = agents[agentId];
    updateAgent(agentId, {
      prompt: existingAgent?.prompt ?? 'Implement user authentication',
      execution: {
        ...(agents[agentId]?.execution ?? {
          status: 'idle',
          currentOutput: '',
          activityLog: [],
          executionHistory: [],
        }),
        activityLog: [
          {
            id: 'demo-step-1',
            message: 'Adding JWT validation',
            status: 'in_progress',
            timestamp: Date.now(),
          },
        ],
      },
    });

    // Start cycling through states
    setIsDemoRunning(true);
    setDemoStateIndex(0);
    const initialStatus = DEMO_STATES[0] ?? 'idle';
    setAgentStatus(agentId, initialStatus);

    demoIntervalRef.current = setInterval(() => {
      setDemoStateIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % DEMO_STATES.length;
        const nextStatus = DEMO_STATES[nextIndex] ?? 'idle';

        if (demoAgentIdRef.current !== null) {
          setAgentStatus(demoAgentIdRef.current, nextStatus);

          // Update error message for error state
          if (nextStatus === 'error') {
            updateAgent(demoAgentIdRef.current, {
              execution: {
                ...(agents[demoAgentIdRef.current]?.execution ?? {
                  status: 'error',
                  currentOutput: '',
                  activityLog: [],
                  executionHistory: [],
                }),
                status: 'error',
                errorMessage: 'Connection timeout - retrying...',
              },
            });
          }
        }

        return nextIndex;
      });
    }, DEMO_INTERVAL_MS);
  }, [isDemoRunning, agents, addAgent, setAgentStatus, updateAgent]);

  return (
    <div className="missions-floating-toolbar">
      {/* Add Agent Button */}
      <button className="missions-floating-btn" onClick={handleAddClick} title="Add Agent">
        <PlusIcon />
        <span>Add Agent</span>
      </button>

      {/* Divider */}
      <div className="missions-floating-divider" />

      {/* Run Mission Button */}
      <button
        className={`missions-floating-btn missions-floating-btn--primary ${isRunning ? 'missions-floating-btn--running' : ''}`}
        onClick={handleRunClick}
        disabled={agentCount === 0}
        title={isRunning ? 'Stop Mission' : 'Run Mission'}
      >
        {isRunning ? <StopIcon /> : <PlayIcon />}
        <span>{isRunning ? 'Stop' : 'Run Mission'}</span>
      </button>

      {/* Divider */}
      <div className="missions-floating-divider" />

      {/* Demo Button - cycles through all agent states */}
      <button
        className={`missions-floating-btn missions-floating-btn--demo ${isDemoRunning ? 'missions-floating-btn--demo-active' : ''}`}
        onClick={handleDemoClick}
        title={isDemoRunning ? `Stop Demo (${String(DEMO_STATES[demoStateIndex])})` : 'Demo States'}
      >
        <FlaskConical size={16} />
        <span>{isDemoRunning ? DEMO_STATES[demoStateIndex] : 'Demo'}</span>
      </button>

      {/* Status */}
      {activeMission !== null && (
        <div className="missions-floating-status">
          <span className="missions-floating-status-count">{agentCount} agents</span>
          {isRunning ? <span className="missions-floating-status-running">Running...</span> : null}
        </div>
      )}
    </div>
  );
}

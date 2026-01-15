/**
 * MissionsFloatingToolbar
 * Floating toolbar for missions mode - add agents, run mission
 */

import React, { useCallback } from 'react';

import { useMissionsStore } from '../stores';

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

export function MissionsFloatingToolbar({
  onAddAgent,
}: MissionsFloatingToolbarProps): React.JSX.Element {
  const activeMission = useMissionsStore((s) => s.activeMission);
  const agents = useMissionsStore((s) => s.agents);
  const startMissionRun = useMissionsStore((s) => s.startMissionRun);
  const completeMissionRun = useMissionsStore((s) => s.completeMissionRun);

  const isRunning = activeMission?.status === 'running';
  const agentCount = Object.keys(agents).length;

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

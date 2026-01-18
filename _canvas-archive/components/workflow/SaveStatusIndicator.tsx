/**
 * Save Status Indicator
 * Shows the current sync status of the workflow
 */

import { IconCheckCircle2 } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconCheckCircle2';
import { IconCircleX } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconCircleX';
import React from 'react';

import { useWorkflowStore, selectSyncState } from '../../stores/workflowStore';

import type { SyncStatus } from '../../stores/workflowStore';

// ============================================================================
// Spinner Icon
// ============================================================================

function SpinnerIcon(): React.JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

// ============================================================================
// Status Display Config
// ============================================================================

interface StatusConfig {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
}

// Icon wrapper to force size (library doesn't respect width/height props)
const iconStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const svgStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
};

const STATUS_CONFIG: Record<SyncStatus, StatusConfig> = {
  idle: {
    label: '',
    color: '#22c55e', // green
    bgColor: 'transparent',
    icon: (
      <span style={iconStyle}>
        <IconCheckCircle2 style={svgStyle} />
      </span>
    ),
  },
  saving: {
    label: '',
    color: 'var(--muted-foreground)',
    bgColor: 'transparent',
    icon: <SpinnerIcon />,
  },
  loading: {
    label: '',
    color: 'var(--muted-foreground)',
    bgColor: 'transparent',
    icon: <SpinnerIcon />,
  },
  error: {
    label: '',
    color: '#ef4444', // red
    bgColor: 'transparent',
    icon: (
      <span style={iconStyle}>
        <IconCircleX style={svgStyle} />
      </span>
    ),
  },
};

// ============================================================================
// Component
// ============================================================================

interface SaveStatusIndicatorProps {
  className?: string;
  style?: React.CSSProperties;
}

export function SaveStatusIndicator({
  className = '',
  style = {},
}: SaveStatusIndicatorProps): React.JSX.Element | null {
  const syncState = useWorkflowStore(selectSyncState);
  const config = STATUS_CONFIG[syncState.status];

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        color: config.color,
        transition: 'all 150ms ease',
        ...style,
      }}
      title={
        syncState.status === 'error' && syncState.lastError !== null
          ? syncState.lastError
          : undefined
      }
    >
      {/* Status icon */}
      <span
        style={{
          display: 'inline-flex',
          animation:
            syncState.status === 'saving' || syncState.status === 'loading'
              ? 'spin 1s linear infinite'
              : undefined,
        }}
      >
        {config.icon}
      </span>

      {/* Inline keyframes for spin animation */}
      <style>
        {`
					@keyframes spin {
						from { transform: rotate(0deg); }
						to { transform: rotate(360deg); }
					}
				`}
      </style>
    </div>
  );
}

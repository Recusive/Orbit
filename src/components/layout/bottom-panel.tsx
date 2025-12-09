import React, { useEffect, useRef } from 'react';

interface BottomPanelProps {
  height: number;
}

// Placeholder terminal component with xterm integration
const TerminalPanel: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // This is where xterm.js would be initialized
    // For now, we'll just show a placeholder
    // console.log('Terminal panel mounted');

    return () => {
      // console.log('Terminal panel unmounted');
    };
  }, []);

  return (
    <div className="w-full h-full bg-black/90 text-green-400 font-mono text-sm p-3 overflow-auto">
      <div ref={terminalRef} className="w-full h-full">
        {/* Placeholder terminal output */}
        <div className="space-y-1">
          <div className="text-gray-400">
            $ Welcome to Orbit Agent Terminal
          </div>
          <div className="text-gray-400">
            $ Type 'help' for available commands
          </div>
          <div className="mt-2">
            <span className="text-blue-400">orbit@agent</span>
            <span className="text-gray-400">:</span>
            <span className="text-green-400">~</span>
            <span className="text-gray-400">$ </span>
            <span className="animate-pulse">_</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const TerminalHeader: React.FC<{
  onClose?: () => void;
  onMaximize?: () => void;
  onClear?: () => void;
}> = ({ onClose, onMaximize, onClear }) => (
  <div className="h-[30px] bg-background border-b border-border flex items-center justify-between px-3">
    <div className="flex items-center gap-2">
      <svg
        className="w-4 h-4 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
      <span className="text-xs font-semibold">Terminal</span>
    </div>

    <div className="flex items-center gap-1">
      <button
        onClick={onClear}
        className="w-6 h-6 flex items-center justify-center hover:bg-accent rounded transition-colors"
        title="Clear Terminal"
        aria-label="Clear Terminal"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>

      <button
        onClick={onMaximize}
        className="w-6 h-6 flex items-center justify-center hover:bg-accent rounded transition-colors"
        title="Maximize Terminal"
        aria-label="Maximize Terminal"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
          />
        </svg>
      </button>

      <button
        onClick={onClose}
        className="w-6 h-6 flex items-center justify-center hover:bg-accent rounded transition-colors"
        title="Close Terminal"
        aria-label="Close Terminal"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  </div>
);

export const BottomPanel: React.FC<BottomPanelProps> = ({ height }) => {
  const handleClear = (): void => {
    // console.log('Clear terminal');
  };

  const handleMaximize = (): void => {
    // console.log('Maximize terminal');
  };

  const handleClose = (): void => {
    // console.log('Close terminal');
  };

  return (
    <div
      className="w-full bg-background border-t border-border flex flex-col min-h-0"
      style={{ height: `${String(height)}px` }}
    >
      <TerminalHeader
        onClose={handleClose}
        onMaximize={handleMaximize}
        onClear={handleClear}
      />
      <div className="flex-1 min-h-0">
        <TerminalPanel />
      </div>
    </div>
  );
};

import React from 'react';

export const HeaderBar: React.FC = () => {
  const handleOpenEditor = (): void => {
    // Handle opening editor - this would interact with Electron IPC
    // console.log('Open editor clicked');
  };

  const handleSettings = (): void => {
    // Handle opening settings
    // console.log('Settings clicked');
  };

  return (
    <header
      className="h-[35px] bg-background border-b border-border flex items-center px-3 justify-between"
      style={{
        // Electron drag region - entire header is draggable
        // @ts-expect-error - WebkitAppRegion is a non-standard property
        WebkitAppRegion: 'drag',
      }}
    >
      {/* Left side - Logo/Title (draggable) */}
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-blue-500/20 flex items-center justify-center">
          <span className="text-xs font-bold text-blue-500">O</span>
        </div>
        <span className="text-sm font-semibold">Orbit Agent</span>
      </div>

      {/* Right side - Actions (non-draggable) */}
      <div
        className="flex items-center gap-2"
        style={{
          // @ts-expect-error - WebkitAppRegion is a non-standard property
          WebkitAppRegion: 'no-drag',
        }}
      >
        <button
          onClick={handleOpenEditor}
          className="px-3 py-1 text-xs font-medium bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
          aria-label="Open Editor"
        >
          Open Editor
        </button>

        <button
          onClick={handleSettings}
          className="w-7 h-7 flex items-center justify-center hover:bg-accent rounded transition-colors"
          aria-label="Settings"
          title="Settings"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
      </div>
    </header>
  );
};

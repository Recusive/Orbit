import React, { useState } from 'react';

interface RightPanelProps {
  width: number;
}

// Placeholder components for review panel
const ReviewPanelHeader: React.FC = () => (
  <div className="h-[40px] bg-background border-b border-border flex items-center px-3 justify-between">
    <h3 className="text-sm font-semibold">Changes</h3>
    <div className="flex items-center gap-2">
      <button
        className="px-2 py-1 text-xs hover:bg-accent rounded transition-colors"
        title="Refresh"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </button>
      <button
        className="px-2 py-1 text-xs hover:bg-accent rounded transition-colors"
        title="More options"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
          />
        </svg>
      </button>
    </div>
  </div>
);

const ReviewTabs: React.FC<{
  activeTab: 'files' | 'source';
  onTabChange: (tab: 'files' | 'source') => void;
}> = ({ activeTab, onTabChange }) => (
  <div className="flex border-b border-border bg-background">
    <button
      className={`px-4 py-2 text-xs font-medium transition-colors ${
        activeTab === 'files'
          ? 'text-foreground border-b-2 border-blue-500'
          : 'text-muted-foreground hover:text-foreground'
      }`}
      onClick={() => { onTabChange('files'); }}
    >
      Files Changed
    </button>
    <button
      className={`px-4 py-2 text-xs font-medium transition-colors ${
        activeTab === 'source'
          ? 'text-foreground border-b-2 border-blue-500'
          : 'text-muted-foreground hover:text-foreground'
      }`}
      onClick={() => { onTabChange('source'); }}
    >
      Source Control
    </button>
  </div>
);

const FilesChangedList: React.FC = () => {
  const files = [
    { name: 'src/components/Button.tsx', status: 'modified', changes: '+12 -3' },
    { name: 'src/utils/helpers.ts', status: 'modified', changes: '+5 -2' },
    { name: 'src/styles/theme.css', status: 'added', changes: '+45' },
    { name: 'src/legacy/old-code.ts', status: 'deleted', changes: '-120' },
  ];

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'modified':
        return 'text-yellow-500';
      case 'added':
        return 'text-green-500';
      case 'deleted':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'modified':
        return 'M';
      case 'added':
        return 'A';
      case 'deleted':
        return 'D';
      default:
        return '?';
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6 text-center">
          <svg
            className="w-12 h-12 mb-3 opacity-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-sm">No changes detected</p>
        </div>
      ) : (
        <div className="p-2">
          {files.map((file, index) => (
            <button
              key={index}
              className="w-full px-3 py-2 hover:bg-accent rounded transition-colors flex items-start gap-3 mb-1 text-left"
            >
              <span
                className={`w-5 h-5 flex items-center justify-center text-xs font-bold rounded ${getStatusColor(
                  file.status
                )}`}
              >
                {getStatusIcon(file.status)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{file.name}</div>
                <div className="text-xs text-muted-foreground">{file.changes}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const SourceControlView: React.FC = () => (
  <div className="flex-1 overflow-y-auto p-3">
    <div className="mb-4">
      <label className="text-xs font-medium text-muted-foreground mb-2 block">
        Commit Message
      </label>
      <textarea
        className="w-full min-h-[80px] px-3 py-2 bg-accent rounded text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Enter commit message..."
      />
    </div>
    <div className="flex gap-2">
      <button className="flex-1 px-3 py-1.5 text-xs font-medium bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors">
        Commit
      </button>
      <button className="px-3 py-1.5 text-xs font-medium hover:bg-accent rounded transition-colors">
        Stash
      </button>
    </div>
  </div>
);

export const RightPanel: React.FC<RightPanelProps> = ({ width }) => {
  const [activeTab, setActiveTab] = useState<'files' | 'source'>('files');

  return (
    <aside
      className="h-full bg-background border-l border-border flex flex-col min-w-0"
      style={{ width: `${String(width)}px` }}
    >
      <ReviewPanelHeader />
      <ReviewTabs activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === 'files' ? <FilesChangedList /> : <SourceControlView />}
    </aside>
  );
};

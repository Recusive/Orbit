import { GitCommit, GitBranch, Upload } from 'lucide-react';
import React, { useState } from 'react';

import { useFileStore } from '../../stores/file-store';

export interface SourceControlTabProps {
  className?: string;
  onCommit?: (message: string, files: string[]) => void;
  onPush?: () => void;
}

export const SourceControlTab: React.FC<SourceControlTabProps> = ({
  className = '',
  onCommit,
  onPush,
}) => {
  const { changedFiles } = useFileStore();
  const [commitMessage, setCommitMessage] = useState('');
  const [stagedFiles, setStagedFiles] = useState<string[]>([]);

  const handleStageAll = (): void => {
    setStagedFiles(changedFiles.map((file) => file.path));
  };

  const handleUnstageAll = (): void => {
    setStagedFiles([]);
  };

  const handleToggleStage = (path: string): void => {
    setStagedFiles((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  };

  const handleCommit = (): void => {
    if (commitMessage.trim() && stagedFiles.length > 0) {
      onCommit?.(commitMessage, stagedFiles);
      setCommitMessage('');
      setStagedFiles([]);
    }
  };

  const handlePush = (): void => {
    onPush?.();
  };

  return (
    <div className={`p-4 space-y-4 ${className}`}>
      {/* Branch Info */}
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <GitBranch className="h-4 w-4" />
        <span className="font-medium">main</span>
      </div>

      {/* Commit Message */}
      <div>
        <label
          htmlFor="commit-message"
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Commit Message
        </label>
        <textarea
          id="commit-message"
          value={commitMessage}
          onChange={(e) => { setCommitMessage(e.target.value); }}
          placeholder="Enter commit message..."
          rows={4}
          className="
            w-full px-3 py-2 rounded-md
            border border-gray-300
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            text-sm
          "
        />
      </div>

      {/* Staging Area */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            Changes ({changedFiles.length})
          </h3>
          <div className="flex gap-2">
            <button
              onClick={handleStageAll}
              disabled={stagedFiles.length === changedFiles.length}
              className="
                text-xs px-2 py-1 rounded
                text-blue-600 hover:bg-blue-50
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors
              "
            >
              Stage All
            </button>
            <button
              onClick={handleUnstageAll}
              disabled={stagedFiles.length === 0}
              className="
                text-xs px-2 py-1 rounded
                text-blue-600 hover:bg-blue-50
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors
              "
            >
              Unstage All
            </button>
          </div>
        </div>

        {/* File List */}
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {changedFiles.map((file) => {
            const isStaged = stagedFiles.includes(file.path);
            const additions = (file.diff?.additions ?? 0) !== 0 ? (file.diff?.additions ?? 0) : 0;
            const deletions = (file.diff?.deletions ?? 0) !== 0 ? (file.diff?.deletions ?? 0) : 0;

            return (
              <div
                key={file.id}
                className="flex items-center justify-between py-2 px-3 rounded hover:bg-gray-50"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={isStaged}
                    onChange={() => { handleToggleStage(file.path); }}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 truncate">
                    {file.path}
                  </span>
                </div>
                <span className="text-xs text-gray-500 ml-2">
                  +{additions} -{deletions}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-gray-200">
        <button
          onClick={handleCommit}
          disabled={!commitMessage.trim() || stagedFiles.length === 0}
          className="
            flex-1 flex items-center justify-center gap-2
            px-4 py-2 rounded-md
            bg-blue-600 hover:bg-blue-700
            text-white text-sm font-medium
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
          "
        >
          <GitCommit className="h-4 w-4" />
          Commit ({stagedFiles.length})
        </button>
        <button
          onClick={handlePush}
          className="
            px-4 py-2 rounded-md
            border border-gray-300 hover:bg-gray-50
            text-gray-700 text-sm font-medium
            transition-colors
          "
        >
          <Upload className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

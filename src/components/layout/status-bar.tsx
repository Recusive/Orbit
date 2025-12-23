import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  GitBranch,
  XCircle,
} from 'lucide-react';
import { useCallback } from 'react';

import type { FC } from 'react';

import { useDiagnostics } from '@/hooks/use-diagnostics';
import { cn } from '@/lib/utils';
import { useActiveFile, useCursorPosition } from '@/stores/file-viewer-store';
import {
  selectAhead,
  selectBehind,
  selectBranch,
  selectTotalChanges,
  useGitStore,
} from '@/stores/git-store';
import { useUIStore } from '@/stores/ui-store';

export interface StatusBarProps {
  className?: string;
}

/** Maximum length for branch name before truncation */
const MAX_BRANCH_LENGTH = 20;

/**
 * Truncate a branch name if it exceeds max length
 */
function truncateBranch(branch: string, maxLength: number = MAX_BRANCH_LENGTH): string {
  if (branch.length <= maxLength) return branch;
  const halfLength = Math.floor((maxLength - 3) / 2);
  return `${branch.slice(0, halfLength)}...${branch.slice(-halfLength)}`;
}

/**
 * Get display name for a language
 */
function getLanguageDisplayName(language: string): string {
  const displayNames: Record<string, string> = {
    typescript: 'TypeScript',
    tsx: 'TypeScript JSX',
    javascript: 'JavaScript',
    jsx: 'JavaScript JSX',
    json: 'JSON',
    markdown: 'Markdown',
    css: 'CSS',
    scss: 'SCSS',
    less: 'Less',
    html: 'HTML',
    xml: 'XML',
    yaml: 'YAML',
    python: 'Python',
    ruby: 'Ruby',
    go: 'Go',
    rust: 'Rust',
    java: 'Java',
    c: 'C',
    cpp: 'C++',
    csharp: 'C#',
    php: 'PHP',
    swift: 'Swift',
    kotlin: 'Kotlin',
    bash: 'Shell Script',
    sql: 'SQL',
    graphql: 'GraphQL',
    vue: 'Vue',
    svelte: 'Svelte',
    toml: 'TOML',
    ini: 'INI',
    dockerfile: 'Dockerfile',
    makefile: 'Makefile',
    dotenv: 'Environment',
    plaintext: 'Plain Text',
  };
  return displayNames[language] ?? language;
}

/**
 * Status bar item component
 */
interface StatusItemProps {
  children: React.ReactNode;
  title?: string;
  onClick?: () => void;
  className?: string;
}

const StatusItem: FC<StatusItemProps> = ({ children, title, onClick, className }) => {
  const baseClasses = 'flex items-center gap-1 px-1.5 py-0.5 text-[11px] leading-none';
  const interactiveClasses = onClick ? 'hover:bg-accent/50 cursor-pointer rounded-sm' : '';

  return (
    <div
      className={cn(baseClasses, interactiveClasses, className)}
      title={title}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
};

/**
 * StatusBar displays git info, cursor position, and file info.
 * Styled similar to VS Code's status bar.
 */
export const StatusBar: FC<StatusBarProps> = ({ className }) => {
  // Git state
  const branch = useGitStore(selectBranch);
  const ahead = useGitStore(selectAhead);
  const behind = useGitStore(selectBehind);
  const totalChanges = useGitStore(selectTotalChanges);
  const isLoading = useGitStore((s) => s.isLoading);
  const error = useGitStore((s) => s.error);
  const repoPath = useGitStore((s) => s.repoPath);

  // File state
  const activeFile = useActiveFile();
  const cursorPosition = useCursorPosition();

  // Diagnostics (LSP problems)
  const { totalErrors, totalWarnings } = useDiagnostics();

  // UI actions
  const { openSourceControl, openProblemsPanel } = useUIStore();

  const isGitRepo = repoPath !== null;
  const hasFile = activeFile !== null;
  const hasProblems = totalErrors > 0 || totalWarnings > 0;

  // Click handlers for right side items (placeholder implementations)
  const handleGoToLine = useCallback((): void => {
    // TODO: Open "Go to Line" dialog
    // For now, could trigger Cmd+G behavior
  }, []);

  const handleIndentationClick = useCallback((): void => {
    // TODO: Open indentation picker (spaces vs tabs, size)
  }, []);

  const handleEncodingClick = useCallback((): void => {
    // TODO: Open encoding picker
  }, []);

  const handleLineEndingClick = useCallback((): void => {
    // TODO: Open line ending picker (LF, CRLF)
  }, []);

  const handleLanguageClick = useCallback((): void => {
    // TODO: Open language mode picker
  }, []);

  return (
    <div
      className={cn(
        'h-[22px] flex items-center justify-between px-3',
        'bg-sidebar border-t border-border',
        'text-muted-foreground',
        className
      )}
    >
      {/* Left section - Git info */}
      <div className="flex items-center gap-0.5 min-w-0">
        {/* Git branch */}
        {error ? (
          <StatusItem
            title={`Git error: ${error}`}
            className="text-destructive"
            onClick={openSourceControl}
          >
            <AlertCircle className="h-3 w-3" />
            <span>error</span>
          </StatusItem>
        ) : branch ? (
          <StatusItem
            title={branch.length > MAX_BRANCH_LENGTH ? branch : `Branch: ${branch}`}
            onClick={openSourceControl}
          >
            <GitBranch className="h-3 w-3" />
            <span className="truncate max-w-[100px]">{truncateBranch(branch)}</span>
            {/* Sync indicators inline */}
            {ahead > 0 || behind > 0 ? (
              <span className="flex items-center gap-0.5 ml-0.5">
                {behind > 0 ? (
                  <>
                    <ArrowDown className="h-2.5 w-2.5" />
                    <span>{behind}</span>
                  </>
                ) : null}
                {ahead > 0 ? (
                  <>
                    <ArrowUp className="h-2.5 w-2.5" />
                    <span>{ahead}</span>
                  </>
                ) : null}
              </span>
            ) : null}
          </StatusItem>
        ) : isGitRepo ? (
          <StatusItem title="Detached HEAD" onClick={openSourceControl}>
            <GitBranch className="h-3 w-3" />
            <span className="italic opacity-70">detached</span>
          </StatusItem>
        ) : null}

        {/* Changes indicator */}
        {totalChanges > 0 ? (
          <StatusItem
            title={`${String(totalChanges)} uncommitted change${totalChanges !== 1 ? 's' : ''} - Click to open Source Control`}
            onClick={openSourceControl}
          >
            <span className="text-yellow-500">●</span>
            <span>{totalChanges}</span>
          </StatusItem>
        ) : null}

        {/* Loading indicator */}
        {isLoading ? (
          <StatusItem>
            <span className="animate-pulse opacity-50">syncing...</span>
          </StatusItem>
        ) : null}

        {/* Problems indicator - LSP diagnostics */}
        {hasProblems ? (
          <StatusItem
            title={`${String(totalErrors)} error${totalErrors !== 1 ? 's' : ''}, ${String(totalWarnings)} warning${totalWarnings !== 1 ? 's' : ''} - Click to open Problems`}
            onClick={openProblemsPanel}
          >
            {totalErrors > 0 ? (
              <>
                <XCircle className="h-3 w-3 text-red-500" />
                <span>{totalErrors}</span>
              </>
            ) : null}
            {totalWarnings > 0 ? (
              <>
                <AlertTriangle
                  className={cn('h-3 w-3 text-yellow-500', totalErrors > 0 && 'ml-1')}
                />
                <span>{totalWarnings}</span>
              </>
            ) : null}
          </StatusItem>
        ) : hasFile ? (
          <StatusItem
            title="No problems detected - Click to open Problems"
            onClick={openProblemsPanel}
          >
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            <span>0</span>
          </StatusItem>
        ) : null}
      </div>

      {/* Right section - File info */}
      <div className="flex items-center gap-0.5">
        {hasFile ? (
          <>
            {/* Cursor position */}
            <StatusItem title="Go to Line" onClick={handleGoToLine}>
              <span>
                Ln {cursorPosition.line}, Col {cursorPosition.column}
              </span>
            </StatusItem>

            {/* Indentation */}
            <StatusItem title="Select Indentation" onClick={handleIndentationClick}>
              <span>Spaces: 2</span>
            </StatusItem>

            {/* Encoding */}
            <StatusItem title="Select Encoding" onClick={handleEncodingClick}>
              <span>UTF-8</span>
            </StatusItem>

            {/* End of line */}
            <StatusItem title="Select End of Line Sequence" onClick={handleLineEndingClick}>
              <span>LF</span>
            </StatusItem>

            {/* Language */}
            <StatusItem title="Select Language Mode" onClick={handleLanguageClick}>
              <span>{getLanguageDisplayName(activeFile.language)}</span>
            </StatusItem>
          </>
        ) : null}
      </div>
    </div>
  );
};

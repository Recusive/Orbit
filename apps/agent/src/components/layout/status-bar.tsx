import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useCallback } from 'react';
import { useShallow } from 'zustand/shallow';

import type { FC } from 'react';

import { useDiagnostics } from '@/hooks/lsp/use-diagnostics';
import { cn } from '@/lib/utils';
import { useActiveFile, useCursorPosition } from '@/stores/file/file-viewer-store';
import { useUIStore } from '@/stores/ui/ui-store';

export interface StatusBarProps {
  className?: string;
}

/**
 * Get display name for a language
 */
function getLanguageDisplayName(language: string): string {
  const displayNames: Record<string, string> = {
    // TypeScript/JavaScript
    typescript: 'TypeScript',
    typescriptreact: 'TypeScript JSX',
    tsx: 'TypeScript JSX',
    javascript: 'JavaScript',
    javascriptreact: 'JavaScript JSX',
    jsx: 'JavaScript JSX',
    // Data formats
    json: 'JSON',
    jsonc: 'JSON',
    // Markup
    markdown: 'Markdown',
    mdx: 'Markdown',
    html: 'HTML',
    xml: 'XML',
    svg: 'SVG',
    // Styles
    css: 'CSS',
    scss: 'SCSS',
    sass: 'SCSS',
    less: 'Less',
    // Config
    yaml: 'YAML',
    yml: 'YAML',
    toml: 'TOML',
    ini: 'INI',
    // Languages
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
    scala: 'Scala',
    // Shell
    bash: 'Shell Script',
    shell: 'Shell Script',
    sh: 'Shell Script',
    zsh: 'Shell Script',
    // Other
    sql: 'SQL',
    graphql: 'GraphQL',
    vue: 'Vue',
    svelte: 'Svelte',
    dockerfile: 'Dockerfile',
    makefile: 'Makefile',
    dotenv: 'Environment',
    // Plain text variants
    plaintext: 'Plain Text',
    text: 'Plain Text',
  };
  return displayNames[language.toLowerCase()] ?? language;
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
  const baseClasses = 'flex items-center gap-1 px-1.5 h-full text-sm rounded-full';
  const interactiveClasses = onClick ? 'hover:bg-accent/50 cursor-pointer' : '';

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
 * StatusBar displays cursor position, file info, and LSP diagnostics.
 * Rendered inside the ActivityPanel below the editor when a file is open.
 */
export const StatusBar: FC<StatusBarProps> = ({ className }) => {
  // File state
  const activeFile = useActiveFile();
  const cursorPosition = useCursorPosition(activeFile?.path ?? null);

  // Diagnostics (LSP problems)
  const { totalErrors, totalWarnings } = useDiagnostics();

  // UI actions — use useShallow to prevent re-renders on unrelated store changes
  const { openProblemsPanel, setGoToLineDialogOpen } = useUIStore(
    useShallow((s) => ({
      openProblemsPanel: s.openProblemsPanel,
      setGoToLineDialogOpen: s.setGoToLineDialogOpen,
    }))
  );

  const hasFile = activeFile !== null;
  const hasProblems = totalErrors > 0 || totalWarnings > 0;

  // Click handlers for right side items
  const handleGoToLine = useCallback((): void => {
    setGoToLineDialogOpen(true);
  }, [setGoToLineDialogOpen]);

  // Don't render if no file is open
  if (!hasFile) return null;

  return (
    <div
      className={cn(
        'relative h-[22px] flex items-stretch justify-between px-3',
        'bg-editor-bg text-muted-foreground',
        className
      )}
    >
      {/* Left section - LSP diagnostics */}
      <div className="flex items-stretch gap-0.5 min-w-0">
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
        ) : (
          <StatusItem
            title="No problems detected - Click to open Problems"
            onClick={openProblemsPanel}
          >
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            <span>0</span>
          </StatusItem>
        )}
      </div>

      {/* Right section - File info */}
      <div className="flex items-stretch gap-0.5">
        {/* Cursor position */}
        <StatusItem title="Go to Line" onClick={handleGoToLine}>
          <span>
            Ln {cursorPosition.line}, Col {cursorPosition.column}
          </span>
        </StatusItem>

        {/* Indentation */}
        <StatusItem title="Indentation">
          <span>Spaces: 2</span>
        </StatusItem>

        {/* Encoding */}
        <StatusItem title="Encoding">
          <span>UTF-8</span>
        </StatusItem>

        {/* End of line */}
        <StatusItem title="End of Line Sequence">
          <span>LF</span>
        </StatusItem>

        {/* Language */}
        <StatusItem title="Language Mode">
          <span>{getLanguageDisplayName(activeFile.language)}</span>
        </StatusItem>
      </div>
    </div>
  );
};

import { Terminal } from 'lucide-react';

import type { FC } from 'react';

export interface InlineCommandProps {
  command: string;
  output?: string;
  exitCode?: number;
  className?: string;
}

export const InlineCommand: FC<InlineCommandProps> = ({
  command,
  output,
  exitCode,
  className = '',
}) => {
  const hasError = exitCode !== undefined && exitCode !== 0;

  return (
    <div
      className={`rounded-lg border bg-muted/50 overflow-hidden ${className}`}
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-muted border-b border-border">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Command
        </span>
        {exitCode !== undefined && (
          <span
            className={`text-xs ml-auto ${
              hasError ? 'text-destructive' : 'text-green-600'
            }`}
          >
            exit {exitCode}
          </span>
        )}
      </div>
      <div className="p-3">
        <code className="text-sm font-mono block text-foreground">
          $ {command}
        </code>
        {output ? <pre
            className={`mt-2 text-sm font-mono whitespace-pre-wrap ${
              hasError ? 'text-destructive' : 'text-muted-foreground'
            }`}
          >
            {output}
          </pre> : null}
      </div>
    </div>
  );
};

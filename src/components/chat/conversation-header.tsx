import { Plus, Globe, SquareTerminal, Code, Eye, ListChecks, PanelRight } from 'lucide-react';

import type { FC } from 'react';

export interface ConversationHeaderProps {
  breadcrumbPath?: string[];
  onNewConversation?: () => void;
  onOpenBrowser?: () => void;
  onOpenTerminal?: () => void;
  onOpenCode?: () => void;
  onOpenPreview?: () => void;
  onReviewChanges?: () => void;
  onTogglePanel?: () => void;
  isPanelOpen?: boolean;
}

export const ConversationHeader: FC<ConversationHeaderProps> = ({
  breadcrumbPath = [],
  onNewConversation,
  onOpenBrowser,
  onOpenTerminal,
  onOpenCode,
  onOpenPreview,
  onReviewChanges,
  onTogglePanel,
  isPanelOpen = false,
}) => {
  return (
    <header className="h-10 border-b border-border bg-background flex items-center justify-between px-4 gap-3">
      {/* Breadcrumb Path */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-1 min-w-0">
        {breadcrumbPath.length > 0 ? (
          breadcrumbPath.map((segment, index) => (
            <div key={index} className="flex items-center gap-2">
              {index > 0 && <span className="text-xs">/</span>}
              <span className="truncate">{segment}</span>
            </div>
          ))
        ) : (
          <span className="text-xs">Conversation</span>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={onNewConversation}
          className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors"
          title="New Conversation"
        >
          <Plus className="h-4 w-4" />
        </button>

        <button
          onClick={onOpenBrowser}
          className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors"
          title="Open Browser"
        >
          <Globe className="h-4 w-4" />
        </button>

        <button
          onClick={onOpenTerminal}
          className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors"
          title="Open Terminal"
        >
          <SquareTerminal className="h-4 w-4" />
        </button>

        <button
          onClick={onOpenCode}
          className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors"
          title="Open Code"
        >
          <Code className="h-4 w-4" />
        </button>

        <button
          onClick={onOpenPreview}
          className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors"
          title="Preview"
        >
          <Eye className="h-4 w-4" />
        </button>

        <div className="w-px h-5 bg-border mx-1" />

        <button
          onClick={onReviewChanges}
          className="h-7 px-3 flex items-center gap-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          <ListChecks className="h-4 w-4" />
          <span>Review Changes</span>
        </button>

        <div className="w-px h-5 bg-border mx-1" />

        <button
          onClick={onTogglePanel}
          className={`h-7 w-7 flex items-center justify-center rounded transition-colors ${
            isPanelOpen ? 'bg-accent' : 'hover:bg-accent'
          }`}
          title="Toggle Panel"
        >
          <PanelRight className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
};

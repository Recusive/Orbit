import { Plus, Globe, Terminal, Code, Eye, PanelRight, ListChecks } from 'lucide-react';

import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/ui-store';

export const CenterPanel: FC = () => {
  const { toggleRightPanel, toggleBottomPanel } = useUIStore();

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">
      {/* Conversation Header */}
      <header className="h-[40px] flex items-center justify-between px-4 border-b border-border">
        <div className="flex items-center gap-1 text-sm">
          <span className="text-muted-foreground">Workspace</span>
          <span className="text-muted-foreground/50">/</span>
          <span>New Conversation</span>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Globe className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleBottomPanel}>
            <Terminal className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Code className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" className="h-7 gap-1" onClick={toggleRightPanel}>
            <ListChecks className="h-4 w-4" />
            <span>Review</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <PanelRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Message Feed */}
      <div className="flex-1 overflow-y-auto flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p className="text-lg mb-1">Start a conversation</p>
          <p className="text-sm">Ask Orbit to help you code</p>
        </div>
      </div>

      {/* Chat Input */}
      <div className="p-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <div
            className="min-h-[60px] text-sm text-muted-foreground outline-none"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Ask anything, @ for context"
          />
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                <Plus className="h-3 w-3" />
                Context
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                Planning
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                Claude Sonnet 4.5
              </Button>
            </div>
            <Button size="sm" className="h-7">
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

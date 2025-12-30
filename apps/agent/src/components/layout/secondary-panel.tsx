import { Terminal, Plus, X } from 'lucide-react';

import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import { HEIGHTS } from '@/lib/constants';

export const SecondaryPanel: FC = () => {
  return (
    <aside className="w-[150px] h-full flex flex-col border-l border-border bg-card/20">
      <header
        className="flex items-center justify-between px-4 border-b border-border shrink-0"
        style={{ height: HEIGHTS.headerBar }}
      >
        <span className="text-xs font-medium">Sessions</span>
        <Button variant="ghost" size="icon" className="h-5 w-5">
          <Plus className="h-3 w-3" />
        </Button>
      </header>

      <div className="flex-1 p-2">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/50 text-sm">
          <Terminal className="h-3 w-3" />
          <span className="flex-1 truncate">zsh</span>
          <button className="opacity-50 hover:opacity-100">
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    </aside>
  );
};

import { X, Maximize2 } from 'lucide-react';

import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import { HEIGHTS } from '@/lib/constants';
import { useUIStore } from '@/stores/ui-store';

interface BottomPanelProps {
  readonly height: number;
}

export const BottomPanel: FC<BottomPanelProps> = ({ height }) => {
  const { toggleBottomPanel } = useUIStore();

  return (
    <div
      className="w-full border-t border-border bg-card/30 flex flex-col"
      style={{ height }}
    >
      <header className="flex items-center justify-between px-2 border-b border-border shrink-0" style={{ height: HEIGHTS.panelHeader }}>
        <span className="text-xs font-medium">Terminal</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-5 w-5">
            <Maximize2 className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={toggleBottomPanel}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </header>

      <div className="flex-1 p-2 font-mono text-xs text-muted-foreground overflow-auto">
        <div>$ <span className="text-foreground">xterm.js will render here</span></div>
        <span className="typing-cursor mt-1" />
      </div>
    </div>
  );
};

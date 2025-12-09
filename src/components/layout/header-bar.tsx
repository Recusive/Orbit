import { Settings } from 'lucide-react';

import type { FC } from 'react';

import { Button } from '@/components/ui/button';

export const HeaderBar: FC = () => {
  return (
    <header className="h-[35px] flex items-center justify-between border-b border-border px-3 bg-card/50">
      <span className="text-sm font-medium">Orbit Agent</span>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-7 text-xs">
          Open Editor
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
};

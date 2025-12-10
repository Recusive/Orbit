import { Settings } from 'lucide-react';

import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import { HEIGHTS } from '@/lib/constants';

export const HeaderBar: FC = () => {
  return (
    <header className="flex items-center justify-between border-b border-border px-3 bg-card/50" style={{ height: HEIGHTS.header }}>
      <div />

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

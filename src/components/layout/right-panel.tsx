import { ChevronLeft, ChevronRight, X } from 'lucide-react';

import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUIStore } from '@/stores/ui-store';

interface RightPanelProps {
  readonly width: number;
}

export const RightPanel: FC<RightPanelProps> = ({ width }) => {
  const { toggleRightPanel } = useUIStore();

  return (
    <aside
      className="h-full flex flex-col border-l border-border bg-card/30"
      style={{ width }}
    >
      {/* Header */}
      <header className="h-[40px] flex items-center justify-between px-2 border-b border-border">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium ml-2">Review Changes</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={toggleRightPanel}>
          <X className="h-4 w-4" />
        </Button>
      </header>

      {/* Tabs */}
      <Tabs defaultValue="files" className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent h-9 px-2">
          <TabsTrigger value="files" className="text-xs">
            Files Changed
          </TabsTrigger>
          <TabsTrigger value="source" className="text-xs">
            Source Control
          </TabsTrigger>
        </TabsList>

        <TabsContent value="files" className="flex-1 m-0 p-2">
          <div className="text-sm text-muted-foreground text-center py-8">
            No files changed yet
          </div>
        </TabsContent>

        <TabsContent value="source" className="flex-1 m-0 p-2">
          <div className="text-sm text-muted-foreground text-center py-8">
            Git status will appear here
          </div>
        </TabsContent>
      </Tabs>
    </aside>
  );
};

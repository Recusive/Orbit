import React from 'react';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';

import { FilesChangedList } from './files-changed-list';
import { SourceControlTab } from './source-control-tab';

export interface ActivityTabsProps {
  className?: string;
}

export const ActivityTabs: React.FC<ActivityTabsProps> = ({ className = '' }) => {
  return (
    <Tabs defaultValue="files-changed" className={className}>
      <TabsList className="w-full justify-start border-b border-border rounded-none bg-transparent p-0">
        <TabsTrigger
          value="files-changed"
          className="
            px-4 py-2 rounded-none border-b-2 border-transparent
            data-[state=active]:border-primary data-[state=active]:text-primary
            hover:bg-muted transition-colors
          "
        >
          Files Changed
        </TabsTrigger>
        <TabsTrigger
          value="source-control"
          className="
            px-4 py-2 rounded-none border-b-2 border-transparent
            data-[state=active]:border-primary data-[state=active]:text-primary
            hover:bg-muted transition-colors
          "
        >
          Source Control
        </TabsTrigger>
      </TabsList>

      <TabsContent value="files-changed" className="mt-0">
        <FilesChangedList />
      </TabsContent>

      <TabsContent value="source-control" className="mt-0">
        <SourceControlTab />
      </TabsContent>
    </Tabs>
  );
};

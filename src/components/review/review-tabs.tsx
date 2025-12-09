import React from 'react';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';

import { FilesChangedList } from './files-changed-list';
import { SourceControlTab } from './source-control-tab';

export interface ReviewTabsProps {
  className?: string;
}

export const ReviewTabs: React.FC<ReviewTabsProps> = ({ className = '' }) => {
  return (
    <Tabs defaultValue="files-changed" className={className}>
      <TabsList className="w-full justify-start border-b border-gray-200 rounded-none bg-transparent p-0">
        <TabsTrigger
          value="files-changed"
          className="
            px-4 py-2 rounded-none border-b-2 border-transparent
            data-[state=active]:border-blue-600 data-[state=active]:text-blue-600
            hover:bg-gray-50 transition-colors
          "
        >
          Files Changed
        </TabsTrigger>
        <TabsTrigger
          value="source-control"
          className="
            px-4 py-2 rounded-none border-b-2 border-transparent
            data-[state=active]:border-blue-600 data-[state=active]:text-blue-600
            hover:bg-gray-50 transition-colors
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

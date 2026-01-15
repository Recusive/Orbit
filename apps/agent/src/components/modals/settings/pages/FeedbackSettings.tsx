import { ChevronRight, FileText, MessageSquare } from 'lucide-react';

import { SectionHeader } from '../components';

import type { FC } from 'react';

export const FeedbackSettings: FC = () => {
  return (
    <div>
      <SectionHeader title="Provide Feedback">Help us improve Orbit</SectionHeader>

      <div className="space-y-3">
        <div className="rounded-lg border border-border/40 p-4 hover:bg-muted/40 cursor-pointer transition-[background-color] duration-150">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-muted-foreground/70" />
            <div>
              <div className="font-medium text-base">Report a Bug</div>
              <div className="text-sm text-muted-foreground/60">
                Found something not working? Let us know
              </div>
            </div>
            <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground/50" />
          </div>
        </div>

        <div className="rounded-lg border border-border/40 p-4 hover:bg-muted/40 cursor-pointer transition-[background-color] duration-150">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground/70" />
            <div>
              <div className="font-medium text-base">Request a Feature</div>
              <div className="text-sm text-muted-foreground/60">
                Have an idea? We&apos;d love to hear it
              </div>
            </div>
            <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground/50" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeedbackSettings;

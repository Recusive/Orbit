import { open } from '@tauri-apps/plugin-shell';
import { ChevronRight, FileText, MessageSquare } from 'lucide-react';
import { useCallback } from 'react';

import { SectionHeader } from '../components';

import type { FC } from 'react';

const BUG_REPORT_URL =
  'https://github.com/Recusive/Orbit/issues/new?labels=bug&template=bug_report.md';
const FEATURE_REQUEST_URL =
  'https://github.com/Recusive/Orbit/issues/new?labels=enhancement&template=feature_request.md';

export const FeedbackSettings: FC = () => {
  const openUrl = useCallback((url: string): void => {
    void open(url);
  }, []);

  return (
    <div>
      <SectionHeader title="Provide Feedback">Help us improve Orbit</SectionHeader>

      <div className="space-y-3">
        <button
          onClick={() => {
            openUrl(BUG_REPORT_URL);
          }}
          className="w-full rounded-[14px] border border-lg-separator p-4 hover:bg-lg-control-hover transition-[background-color] duration-150 text-left cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-muted-foreground/90" />
            <div>
              <div className="font-medium text-base">Report a Bug</div>
              <div className="text-sm text-muted-foreground/80">
                Found something not working? Let us know
              </div>
            </div>
            <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground/90" />
          </div>
        </button>

        <button
          onClick={() => {
            openUrl(FEATURE_REQUEST_URL);
          }}
          className="w-full rounded-[14px] border border-lg-separator p-4 hover:bg-lg-control-hover transition-[background-color] duration-150 text-left cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground/90" />
            <div>
              <div className="font-medium text-base">Request a Feature</div>
              <div className="text-sm text-muted-foreground/80">
                Have an idea? We&apos;d love to hear it
              </div>
            </div>
            <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground/90" />
          </div>
        </button>
      </div>
    </div>
  );
};

export default FeedbackSettings;

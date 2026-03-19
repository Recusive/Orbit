import { useMemo } from 'react';

import { ChangelogRenderer } from './changelog/changelog-renderer';

import type { ChangelogEntry } from '@/lib/changelog-loader';
import type { FC } from 'react';

import { getMergedChangelogs } from '@/lib/changelog-loader';
import { cn } from '@/lib/utils';
import { useUpdateStore } from '@/stores/ui/update-store';

const VIRTUAL_ENTRY_DATE = 'Available now';

function getEntryAnchorId(version: string): string {
  return `changelog-entry-${version.replaceAll('.', '-')}`;
}

export function parseChangelogDate(dateStr: string): Date {
  const [year = Number.NaN, month = Number.NaN, day = Number.NaN] = dateStr.split('-').map(Number);

  if ([year, month, day].some((value) => Number.isNaN(value))) {
    return new Date(Number.NaN);
  }

  return new Date(year, month - 1, day);
}

export function formatChangelogDate(dateStr: string): string {
  const date = parseChangelogDate(dateStr);
  if (Number.isNaN(date.getTime())) {
    return dateStr;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

interface ChangelogTimelineItemProps {
  readonly entry: ChangelogEntry;
  readonly isLatest: boolean;
  readonly isLast: boolean;
}

const ChangelogTimelineItem: FC<ChangelogTimelineItemProps> = ({ entry, isLatest, isLast }) => {
  const formattedDate = formatChangelogDate(entry.date);
  const isVirtualEntry = entry.date === VIRTUAL_ENTRY_DATE;
  const anchorId = getEntryAnchorId(entry.version);

  return (
    <div id={anchorId} className="relative scroll-mt-8">
      <div className="flex gap-y-4">
        {/* Left — date & version */}
        <div className="w-36 shrink-0">
          <div className="sticky top-0 pb-10">
            <time className="block text-[13px] font-medium tabular-nums text-muted-foreground/50">
              {formattedDate}
            </time>

            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.06)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
                {entry.version}
              </span>
              {isLatest ? (
                <span className="rounded-md bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                  Latest
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Right — content with timeline dot + line on left edge */}
        <div className="relative flex-1 pl-8 pb-10">
          {/* Timeline dot */}
          <div
            className={cn(
              'absolute left-0 top-[0.2rem] z-10 h-2.5 w-2.5 -translate-x-1/2 rounded-full',
              isLatest ? 'bg-foreground' : 'bg-border'
            )}
          />
          {/* Vertical timeline line */}
          {!isLast ? (
            <div className="absolute left-0 top-[0.75rem] h-[calc(100%-0.25rem)] w-px -translate-x-1/2 bg-border/40" />
          ) : null}

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
                {entry.title}
              </h3>
              {isVirtualEntry ? (
                <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  Update available
                </span>
              ) : null}
            </div>
            <ChangelogRenderer markdown={entry.body} />
          </div>
        </div>
      </div>
    </div>
  );
};

export const ChangelogSettings: FC = () => {
  const availableVersion = useUpdateStore((state) => state.availableVersion);
  const releaseNotes = useUpdateStore((state) => state.releaseNotes);

  const entries = useMemo(
    () => getMergedChangelogs(availableVersion, releaseNotes),
    [availableVersion, releaseNotes]
  );

  return (
    <div className="pb-10 animate-settings-in">
      {entries.length === 0 ? (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-border/50 px-5 py-12 text-sm text-muted-foreground/60">
          No changelogs available
        </div>
      ) : (
        <div className="relative">
          {entries.map((entry, index) => (
            <ChangelogTimelineItem
              key={entry.version}
              entry={entry}
              isLatest={index === 0}
              isLast={index === entries.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ChangelogSettings;

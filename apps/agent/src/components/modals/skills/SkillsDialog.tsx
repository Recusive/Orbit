/**
 * SkillsDialog — Installed skills and marketplace browser.
 */
import { Maximize2, Minimize2, Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { InstalledSkillsPane } from './InstalledSkillsPane';
import { MarketplacePane } from './MarketplacePane';

import type { BrowseCategory } from '@/lib/api/marketplace';
import type { SkillDefinition } from '@/types/protocol';
import type { FC } from 'react';

import {
  Dialog,
  DialogClose,
  DialogContentGlass,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { dispatchAddContextChip } from '@/lib/events/chat-context-events';
import { cn } from '@/lib/utils';
import { useCommandsStore } from '@/stores/agent';

type SkillsTab = 'installed' | 'marketplace';

export interface SkillsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const SkillsDialog: FC<SkillsDialogProps> = ({ open, onOpenChange }) => {
  const searchRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<SkillsTab>('installed');
  const [installedSearch, setInstalledSearch] = useState('');
  const [marketplaceSearch, setMarketplaceSearch] = useState('');
  const [installedRefreshToken, setInstalledRefreshToken] = useState(0);
  const [browseCategory, setBrowseCategory] = useState<BrowseCategory>('trending');
  const [infoExpanded, setInfoExpanded] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveTab('installed');
    setInstalledSearch('');
    setMarketplaceSearch('');

    const isTouchDevice = 'ontouchstart' in window;
    if (!isTouchDevice) {
      window.setTimeout(() => {
        searchRef.current?.focus();
      }, 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const isTouchDevice = 'ontouchstart' in window;
    if (!isTouchDevice) {
      window.setTimeout(() => {
        searchRef.current?.focus();
      }, 30);
    }
  }, [activeTab, open]);

  const handleSkillSelect = useCallback(
    (skill: SkillDefinition): void => {
      dispatchAddContextChip({
        id: crypto.randomUUID(),
        type: 'skill',
        name: skill.name,
        path: skill.name,
      });
      onOpenChange(false);
    },
    [onOpenChange]
  );

  const activeSearch = activeTab === 'installed' ? installedSearch : marketplaceSearch;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContentGlass className="w-[720px] h-[560px] max-h-[85vh] flex flex-col gap-0 p-0 glass-surface [&>.absolute]:hidden">
        <div className="shrink-0 p-2 pb-2">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              type="text"
              value={activeSearch}
              onChange={(e) => {
                if (activeTab === 'installed') {
                  setInstalledSearch(e.target.value);
                } else {
                  setMarketplaceSearch(e.target.value);
                }
              }}
              placeholder={
                activeTab === 'installed' ? 'Search installed skills' : 'Search marketplace'
              }
              spellCheck={false}
              autoComplete="off"
              className={cn(
                'w-full h-9 rounded-[9px] bg-control-fill pl-9 pr-9 text-sm',
                'placeholder:text-muted-foreground/40 outline-none',
                'transition-[background-color] duration-150',
                'focus:bg-control-fill-hover'
              )}
            />
            <DialogClose className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 bg-foreground/8 text-muted-foreground/50 transition-all duration-150 hover:bg-destructive-subtle hover:text-destructive-text">
              <X className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>

          <DialogTitle className="sr-only">Skills</DialogTitle>
          <DialogDescription className="sr-only">
            Browse installed skills and discover new skills from the marketplace
          </DialogDescription>
        </div>

        <div className="shrink-0 px-2 pb-2 flex items-center justify-between">
          <div className="relative inline-grid grid-cols-2 rounded-full bg-foreground/[0.05] p-1">
            <div
              className="absolute inset-y-1 left-1 w-[calc((100%-8px)/2)] rounded-full bg-foreground shadow-sm transition-transform duration-200 ease-out"
              style={{
                transform: activeTab === 'marketplace' ? 'translateX(100%)' : 'translateX(0)',
              }}
            />
            <button
              type="button"
              onClick={() => {
                setActiveTab('installed');
              }}
              className={cn(
                'relative z-10 flex items-center justify-center gap-1.5 rounded-full h-6 px-3 text-[13px] font-medium transition-colors duration-150',
                activeTab === 'installed'
                  ? 'text-background'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Installed
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('marketplace');
              }}
              className={cn(
                'relative z-10 flex items-center justify-center gap-1.5 rounded-full h-6 px-3 text-[13px] font-medium transition-colors duration-150',
                activeTab === 'marketplace'
                  ? 'text-background'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Marketplace
            </button>
          </div>

          {activeTab === 'marketplace' && (
            <div className="relative inline-grid grid-cols-2 rounded-full bg-foreground/[0.05] p-1">
              <div
                className="absolute inset-y-1 left-1 w-[calc((100%-8px)/2)] rounded-full bg-foreground shadow-sm transition-transform duration-200 ease-out"
                style={{
                  transform: browseCategory === 'top' ? 'translateX(100%)' : 'translateX(0)',
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setBrowseCategory('trending');
                }}
                className={cn(
                  'relative z-10 flex items-center justify-center gap-1.5 rounded-full h-6 px-3 text-[13px] font-medium transition-colors duration-150',
                  browseCategory === 'trending'
                    ? 'text-background'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Trending
              </button>
              <button
                type="button"
                onClick={() => {
                  setBrowseCategory('top');
                }}
                className={cn(
                  'relative z-10 flex items-center justify-center gap-1.5 rounded-full h-6 px-3 text-[13px] font-medium transition-colors duration-150',
                  browseCategory === 'top'
                    ? 'text-background'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Top
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0">
          <div className={cn('h-full', activeTab === 'installed' ? 'block' : 'hidden')}>
            <InstalledSkillsPane
              open={open}
              active={activeTab === 'installed'}
              search={installedSearch}
              refreshToken={installedRefreshToken}
              onSkillSelect={handleSkillSelect}
            />
          </div>

          <div className={cn('h-full', activeTab === 'marketplace' ? 'block' : 'hidden')}>
            <MarketplacePane
              active={activeTab === 'marketplace'}
              search={marketplaceSearch}
              browseCategory={browseCategory}
              onCategoryChange={setBrowseCategory}
              onInstalled={() => {
                setInstalledRefreshToken((current) => current + 1);
                void useCommandsStore.getState().refreshSkills();
              }}
            />
          </div>
        </div>

        <div className="shrink-0 px-2 pb-2">
          {activeTab === 'installed' ? (
            <div className="rounded-[12px] bg-lg-control text-sm text-muted-foreground/70">
              <div className="flex items-center justify-between p-3 py-2">
                <p className="font-medium text-[12px] text-foreground/70">How Skills Work</p>
                <button
                  type="button"
                  onClick={() => {
                    setInfoExpanded((prev) => !prev);
                  }}
                  className="rounded-md p-0.5 text-muted-foreground/50 hover:text-foreground/70"
                  aria-label={infoExpanded ? 'Collapse' : 'Expand'}
                >
                  {infoExpanded ? (
                    <Minimize2 className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <Maximize2 className="h-3 w-3" aria-hidden="true" />
                  )}
                </button>
              </div>
              <div
                className="grid transition-[grid-template-rows,opacity,filter,padding] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] motion-reduce:transition-none"
                style={{
                  gridTemplateRows: infoExpanded ? '1fr' : '0fr',
                  opacity: infoExpanded ? 1 : 0,
                  filter: infoExpanded ? 'blur(0px)' : 'blur(4px)',
                  paddingBottom: infoExpanded ? 12 : 0,
                }}
              >
                <ul className="list-disc list-inside space-y-0.5 text-[12px] px-3 overflow-hidden min-h-0">
                  <li>
                    Project skills live in{' '}
                    <code className="bg-lg-control-hover px-1 rounded-md">.claude/skills/</code>
                  </li>
                  <li>
                    Personal skills live in{' '}
                    <code className="bg-lg-control-hover px-1 rounded-md">~/.claude/skills/</code>
                  </li>
                  <li>Each skill is a SKILL.md file with YAML frontmatter</li>
                  <li>Skills are automatically loaded when matched by triggers</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-[12px] bg-lg-control text-[12px] text-muted-foreground/70">
              Browse curated skills from the open{' '}
              <a
                href="https://skills.sh"
                target="_blank"
                rel="noreferrer"
                className="text-foreground/80 underline underline-offset-2 hover:text-foreground"
              >
                skills.sh
              </a>{' '}
              marketplace.
            </div>
          )}
        </div>
      </DialogContentGlass>
    </Dialog>
  );
};

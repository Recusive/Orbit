/**
 * SkillsDialog — Installed skills and marketplace browser.
 */
import { Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { InstalledSkillsPane } from './InstalledSkillsPane';
import { MarketplacePane } from './MarketplacePane';

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
        <div className="shrink-0 p-3 pb-2">
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

        <div className="shrink-0 px-3 pb-2">
          <div className="inline-flex rounded-xl bg-lg-control p-1">
            <button
              type="button"
              onClick={() => {
                setActiveTab('installed');
              }}
              className={cn(
                'h-8 rounded-lg px-3 text-[12px] font-medium transition-colors',
                activeTab === 'installed'
                  ? 'bg-control-fill text-foreground shadow-sm'
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
                'h-8 rounded-lg px-3 text-[12px] font-medium transition-colors',
                activeTab === 'marketplace'
                  ? 'bg-control-fill text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Marketplace
            </button>
          </div>
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
              onInstalled={() => {
                setInstalledRefreshToken((current) => current + 1);
                void useCommandsStore.getState().refreshSkills();
              }}
            />
          </div>
        </div>

        <div className="shrink-0 px-4 pb-3">
          {activeTab === 'installed' ? (
            <div className="p-3 rounded-[12px] bg-lg-control text-sm text-muted-foreground/70">
              <p className="font-medium mb-1 text-foreground/70">How Skills Work</p>
              <ul className="list-disc list-inside space-y-0.5 text-[12px]">
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

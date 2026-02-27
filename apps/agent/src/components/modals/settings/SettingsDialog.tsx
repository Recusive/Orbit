import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronRight, Settings2, X } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';

import { SettingsSidebar, FEEDBACK_ITEM, NAV_ITEMS } from './SettingsSidebar';
import { SETTINGS_PAGE_COMPONENTS, SlashCommandsSettings, SubagentsSettings } from './pages';

import type { SettingsDialogProps, SettingsSection } from './types';
import type { FC, ReactNode } from 'react';

import { SFSymbol } from '@/components/shared';
import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { ThinkingDots } from '@/components/ui/thinking-dots';
import { useSmoothScroll } from '@/hooks/ui';
import { cn } from '@/lib/utils';

// Loading fallback for lazy-loaded pages
const PageLoader: FC = () => (
  <div className="flex items-center justify-center h-full">
    <ThinkingDots size={15} />
  </div>
);

export const SettingsDialog: FC<SettingsDialogProps> = ({
  open,
  onOpenChange,
  defaultSection = 'agent',
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>(defaultSection);

  // Smooth scroll for each settings page panel (each is an independent scroll container)
  const staticScrollRef = useSmoothScroll(0.08);
  const subagentsScrollRef = useSmoothScroll(0.08);
  const commandsScrollRef = useSmoothScroll(0.08);

  // Track which async sections have been visited (so we only mount them once)
  // Once visited, they stay mounted to preserve fetched data
  const [visitedSubagents, setVisitedSubagents] = useState(false);
  const [visitedCommands, setVisitedCommands] = useState(false);

  // Mark async sections as visited when navigating to them
  useEffect(() => {
    if (activeSection === 'subagents') setVisitedSubagents(true);
    if (activeSection === 'commands') setVisitedCommands(true);
  }, [activeSection]);

  // Reset to defaultSection when dialog opens
  useEffect(() => {
    if (open) {
      setActiveSection(defaultSection);
      // Reset visited state when dialog opens fresh
      setVisitedSubagents(defaultSection === 'subagents');
      setVisitedCommands(defaultSection === 'commands');
    }
  }, [open, defaultSection]);

  // Check if we're on an async section (subagents or commands)
  const isAsyncSection = activeSection === 'subagents' || activeSection === 'commands';

  const activeItem: { label: string; icon: ReactNode } =
    activeSection === 'feedback'
      ? FEEDBACK_ITEM
      : (NAV_ITEMS.find((n) => n.id === activeSection) ?? { label: 'Settings', icon: null });

  // Render static content via lazy-loaded components
  const renderStaticContent = (): ReactNode => {
    const PageComponent = SETTINGS_PAGE_COMPONENTS[activeSection];
    if (PageComponent === undefined) {
      return null;
    }
    return (
      <Suspense fallback={<PageLoader />}>
        <PageComponent />
      </Suspense>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="backdrop-blur-none bg-black/40" />

        {/* Centering wrapper */}
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="relative pointer-events-auto">
            {/* Dialog content with CSS animations - matches delete dialog pattern */}
            <DialogPrimitive.Content
              aria-describedby={undefined}
              className={cn(
                'relative z-10 w-[720px] max-w-[90vw] h-[600px] max-h-[85vh]',
                'bg-sidebar border-0 shadow-none',
                'rounded-[14px] overflow-hidden flex flex-col',
                'duration-200',
                'data-[state=open]:animate-in data-[state=closed]:animate-out',
                'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
                'data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98]'
              )}
            >
              {/* Accessibility: Hidden title for screen readers */}
              <DialogPrimitive.Title className="sr-only">
                Settings &gt; {activeItem.label}
              </DialogPrimitive.Title>

              {/* Title bar */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-sidebar">
                <div className="flex items-center gap-2 font-medium text-base">
                  <SFSymbol
                    name="gear"
                    size={18}
                    weight="medium"
                    className="shrink-0 text-muted-foreground"
                    fallback={<Settings2 className="h-4 w-4" />}
                  />
                  <span className="text-muted-foreground">Settings</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span>{activeItem.icon}</span>
                  <span>{activeItem.label}</span>
                </div>
                <DialogPrimitive.Close className="rounded-md p-1 text-lg-text-secondary hover:text-foreground hover:bg-lg-control-hover active:scale-95 transition-[opacity,background-color,color,transform] duration-150">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </DialogPrimitive.Close>
              </div>

              {/* Content */}
              <div className="flex flex-1 overflow-hidden border-t border-foreground/10">
                {/* Sidebar */}
                <SettingsSidebar activeSection={activeSection} onSectionChange={setActiveSection} />

                {/* Main content */}
                <div className="flex-1 overflow-auto bg-sidebar relative">
                  {/* Static sections - render via lazy components (unmounted when inactive) */}
                  {!isAsyncSection && (
                    <div
                      ref={staticScrollRef}
                      className="absolute inset-0 p-6 overflow-auto overscroll-y-contain"
                    >
                      {renderStaticContent()}
                    </div>
                  )}

                  {/* Async sections - kept mounted once visited to prevent re-fetch flash */}
                  {/* These fetch data on mount; once visited, they stay mounted to preserve data */}
                  {visitedSubagents ? (
                    <div
                      ref={subagentsScrollRef}
                      className={cn(
                        'absolute inset-0 p-6 overflow-auto overscroll-y-contain',
                        activeSection !== 'subagents' && 'hidden'
                      )}
                    >
                      <SubagentsSettings />
                    </div>
                  ) : null}
                  {visitedCommands ? (
                    <div
                      ref={commandsScrollRef}
                      className={cn(
                        'absolute inset-0 p-6 overflow-auto overscroll-y-contain',
                        activeSection !== 'commands' && 'hidden'
                      )}
                    >
                      <SlashCommandsSettings />
                    </div>
                  ) : null}
                </div>
              </div>
            </DialogPrimitive.Content>
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
};

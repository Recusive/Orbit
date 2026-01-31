import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Settings2, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Suspense, useEffect, useState } from 'react';

import { SettingsSidebar, FEEDBACK_ITEM, NAV_ITEMS } from './SettingsSidebar';
import { SETTINGS_PAGE_COMPONENTS, SlashCommandsSettings, SubagentsSettings } from './pages';

import type { SettingsDialogProps, SettingsSection } from './types';
import type { FC, ReactNode } from 'react';

import { Dialog, DialogPortal } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

// Animation configuration for the settings dialog
const DIALOG_ANIMATION = {
  // Custom easing curve for natural feel (not default ease/linear)
  easing: [0.16, 1, 0.3, 1] as const, // Custom spring-like curve
  duration: 0.3,
  exitDuration: 0.15, // Faster exit to avoid ghosting
} as const;

// Overlay (backdrop) animation variants
const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: DIALOG_ANIMATION.exitDuration } },
};

// Content animation variants - scale + fade + subtle slide on enter, quick fade on exit
const contentVariants = {
  hidden: {
    opacity: 0,
    scale: 0.96,
    y: 8,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
    transition: { duration: DIALOG_ANIMATION.exitDuration },
    // No scale/slide on exit - just fade to avoid ghosting
  },
};

// Loading fallback for lazy-loaded pages
const PageLoader: FC = () => (
  <div className="flex items-center justify-center h-full">
    <Spinner size="lg" className="text-muted-foreground/60" />
  </div>
);

export const SettingsDialog: FC<SettingsDialogProps> = ({
  open,
  onOpenChange,
  defaultSection = 'agent',
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>(defaultSection);
  const shouldReduceMotion = useReducedMotion();

  // Instant transitions for users with reduced motion preference
  const reducedMotionTransition = { duration: 0.01 };

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

  const getSectionTitle = (): string => {
    if (activeSection === 'feedback') return FEEDBACK_ITEM.label;
    const item = NAV_ITEMS.find((n) => n.id === activeSection);
    return item?.label ?? 'Settings';
  };

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
      <AnimatePresence>
        {open ? (
          <DialogPortal forceMount>
            {/* Animated overlay/backdrop - clicks close the dialog */}
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
                initial={overlayVariants.hidden}
                animate={overlayVariants.visible}
                exit={shouldReduceMotion ? { opacity: 0 } : overlayVariants.exit}
                transition={
                  shouldReduceMotion
                    ? reducedMotionTransition
                    : { duration: DIALOG_ANIMATION.duration, ease: DIALOG_ANIMATION.easing }
                }
                onClick={() => {
                  onOpenChange(false);
                }}
              />
            </DialogPrimitive.Overlay>

            {/* Animated dialog content */}
            <DialogPrimitive.Content asChild forceMount aria-describedby={undefined}>
              {/* Outer div handles centering + click-outside-to-close */}
              <div
                className="fixed inset-0 z-50 flex items-center justify-center"
                onClick={() => {
                  onOpenChange(false);
                }}
              >
                <motion.div
                  className="w-[720px] max-w-[90vw] h-[600px] max-h-[85vh] bg-card border-[3px] border-border/40 rounded-xl overflow-hidden flex flex-col"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  style={{
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                  }}
                  initial={shouldReduceMotion ? { opacity: 0 } : contentVariants.hidden}
                  animate={shouldReduceMotion ? { opacity: 1 } : contentVariants.visible}
                  exit={shouldReduceMotion ? { opacity: 0 } : contentVariants.exit}
                  transition={
                    shouldReduceMotion
                      ? reducedMotionTransition
                      : { duration: DIALOG_ANIMATION.duration, ease: DIALOG_ANIMATION.easing }
                  }
                >
                  {/* Accessibility: Hidden title for screen readers */}
                  <DialogPrimitive.Title className="sr-only">
                    Settings - {getSectionTitle()}
                  </DialogPrimitive.Title>
                  {/* Title bar */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Settings2 className="h-4 w-4 text-muted-foreground/70" />
                      <span className="font-medium text-base">Settings - {getSectionTitle()}</span>
                    </div>
                    <DialogPrimitive.Close className="rounded-md p-1 opacity-60 hover:opacity-100 hover:bg-muted/50 active:scale-95 transition-[opacity,background-color,transform] duration-150">
                      <X className="h-4 w-4" />
                      <span className="sr-only">Close</span>
                    </DialogPrimitive.Close>
                  </div>

                  {/* Content */}
                  <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar */}
                    <SettingsSidebar
                      activeSection={activeSection}
                      onSectionChange={setActiveSection}
                    />

                    {/* Main content */}
                    <div className="flex-1 overflow-auto bg-card relative">
                      {/* Static sections - render via lazy components (unmounted when inactive) */}
                      {!isAsyncSection && (
                        <div className="absolute inset-0 p-6 overflow-auto">
                          {renderStaticContent()}
                        </div>
                      )}

                      {/* Async sections - kept mounted once visited to prevent re-fetch flash */}
                      {/* These fetch data on mount; once visited, they stay mounted to preserve data */}
                      {visitedSubagents ? (
                        <div
                          className={cn(
                            'absolute inset-0 p-6 overflow-auto',
                            activeSection !== 'subagents' && 'hidden'
                          )}
                        >
                          <SubagentsSettings />
                        </div>
                      ) : null}
                      {visitedCommands ? (
                        <div
                          className={cn(
                            'absolute inset-0 p-6 overflow-auto',
                            activeSection !== 'commands' && 'hidden'
                          )}
                        >
                          <SlashCommandsSettings />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </motion.div>
              </div>
            </DialogPrimitive.Content>
          </DialogPortal>
        ) : null}
      </AnimatePresence>
    </Dialog>
  );
};

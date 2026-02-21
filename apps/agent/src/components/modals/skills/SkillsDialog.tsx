/**
 * SkillsDialog — Read-only dialog listing all available skills.
 *
 * Skills are filesystem artifacts (SKILL.md files with YAML frontmatter) discovered from
 * project (.claude/skills/) and user (~/.claude/skills/) directories. This dialog
 * fetches and displays them grouped by source with loading, error, and empty states.
 */
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { ExtensionMessage, SkillDefinition } from '@/types/protocol';
import type { FC } from 'react';

import { IconSkills } from '@/components/layout/primary-sidebar/components/IconSkills';
import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { useTauri } from '@/hooks/agent/use-tauri';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface SkillsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

// ═══════════════════════════════════════════════════════════════
// Skill Card
// ═══════════════════════════════════════════════════════════════

interface SkillCardProps {
  readonly skill: SkillDefinition;
  readonly onSelect: (skill: SkillDefinition) => void;
}

const SkillCard: FC<SkillCardProps> = ({ skill, onSelect }) => (
  <div
    className="rounded-lg border border-lg-separator p-4 hover:bg-lg-control-hover transition-[background-color] duration-150 cursor-pointer active:scale-[0.99]"
    onClick={() => {
      onSelect(skill);
    }}
  >
    <div className="flex items-start gap-3 min-w-0">
      <div className="h-8 w-8 rounded-lg bg-lg-control flex items-center justify-center shrink-0">
        <IconSkills className="h-4 w-4 text-lg-text-secondary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-base truncate">{skill.name}</div>
        {skill.description !== '' && (
          <div className="text-sm text-muted-foreground/90 line-clamp-2 mt-1 wrap-break-word">
            {skill.description}
          </div>
        )}
        {skill.triggers !== undefined && skill.triggers.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {skill.triggers.map((trigger) => (
              <span
                key={trigger}
                className="text-xs px-1.5 py-0.5 rounded-md bg-lg-control text-muted-foreground/90"
              >
                {trigger}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// Loading Skeleton
// ═══════════════════════════════════════════════════════════════

const SkillsSkeleton: FC = () => (
  <div className="space-y-2">
    {[1, 2, 3].map((i) => (
      <div key={i} className="rounded-lg border border-lg-separator p-4">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-lg bg-lg-control animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-28 rounded bg-lg-control animate-pulse" />
            <div className="h-3 w-48 rounded bg-lg-control animate-pulse" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

// ═══════════════════════════════════════════════════════════════
// Skill Group
// ═══════════════════════════════════════════════════════════════

interface SkillGroupProps {
  readonly label: string;
  readonly dotColor: string;
  readonly skills: readonly SkillDefinition[];
  readonly onSelect: (skill: SkillDefinition) => void;
}

const SkillGroup: FC<SkillGroupProps> = ({ label, dotColor, skills, onSelect }) => (
  <div>
    <div className="text-xs font-medium text-muted-foreground/90 mb-2 flex items-center gap-2">
      <span className={cn('h-2 w-2 rounded-full', dotColor)} />
      {label}
    </div>
    <div className="space-y-2">
      {skills.map((skill) => (
        <SkillCard key={`${skill.source}-${skill.name}`} skill={skill} onSelect={onSelect} />
      ))}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// Dialog
// ═══════════════════════════════════════════════════════════════

export const SkillsDialog: FC<SkillsDialogProps> = ({ open, onOpenChange }) => {
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Handle incoming skill messages
  const handleMessage = useCallback((message: ExtensionMessage): void => {
    if (message.type === 'skills:list:response') {
      setSkills(message.skills);
      setError(null);
      setIsLoading(false);
    } else if (message.type === 'skills:error') {
      setError(message.error);
      setIsLoading(false);
    }
  }, []);

  const { postMessage } = useTauri({ onMessage: handleMessage });

  // Fetch skills whenever dialog opens (re-fetches on every open for fresh data)
  useEffect(() => {
    if (open) {
      setIsLoading(true);
      setError(null);
      postMessage({
        type: 'skills:list',
        uuid: crypto.randomUUID(),
      });
    }
  }, [open, postMessage]);

  const projectSkills = skills.filter((s) => s.source === 'project');
  const personalSkills = skills.filter((s) => s.source === 'user');

  // Clicking a skill adds it as a context chip above the input and closes the dialog
  const handleSkillSelect = useCallback(
    (skill: SkillDefinition): void => {
      window.dispatchEvent(new CustomEvent('addSkillChip', { detail: { name: skill.name } }));
      onOpenChange(false);
    },
    [onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />

        {/* Centering wrapper */}
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="relative pointer-events-auto">
            <DialogPrimitive.Content
              aria-describedby={undefined}
              className={cn(
                'relative z-10 w-[720px] max-w-[90vw] h-[600px] max-h-[85vh]',
                'bg-card',
                'border border-lg-separator rounded-[14px] overflow-hidden flex flex-col',
                'shadow-lg duration-200',
                'data-[state=open]:animate-in data-[state=closed]:animate-out',
                'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
                'data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98]'
              )}
            >
              {/* Accessibility: Hidden title for screen readers */}
              <DialogPrimitive.Title className="sr-only">Skills</DialogPrimitive.Title>

              {/* Title bar */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-transparent">
                <div className="flex items-center gap-2 font-medium text-base">
                  <IconSkills className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>Skills</span>
                </div>
                <DialogPrimitive.Close className="rounded-md p-1 text-lg-text-secondary hover:text-foreground hover:bg-lg-control-hover active:scale-95 transition-[opacity,background-color,color,transform] duration-150">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </DialogPrimitive.Close>
              </div>
              <div className="h-px bg-border/40 shrink-0" />

              {/* Scrollable content */}
              <div className="flex-1 overflow-auto p-6">
                {/* Loading state */}
                {isLoading ? (
                  <SkillsSkeleton />
                ) : error !== null ? (
                  /* Error state */
                  <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-base">
                    {error}
                  </div>
                ) : skills.length === 0 ? (
                  /* Empty state */
                  <div className="text-center py-12 text-muted-foreground/90">
                    <IconSkills className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-base">No skills found.</p>
                    <p className="text-sm mt-1">
                      Add skills to{' '}
                      <code className="bg-lg-control px-1 py-0.5 rounded-md">.claude/skills/</code>{' '}
                      in your project or{' '}
                      <code className="bg-lg-control px-1 py-0.5 rounded-md">
                        ~/.claude/skills/
                      </code>{' '}
                      for personal skills.
                    </p>
                  </div>
                ) : (
                  /* Skills list grouped by source */
                  <div className="space-y-6">
                    {projectSkills.length > 0 && (
                      <SkillGroup
                        label="Project Skills"
                        dotColor="bg-green-500"
                        skills={projectSkills}
                        onSelect={handleSkillSelect}
                      />
                    )}
                    {personalSkills.length > 0 && (
                      <SkillGroup
                        label="Personal Skills"
                        dotColor="bg-orange-500"
                        skills={personalSkills}
                        onSelect={handleSkillSelect}
                      />
                    )}
                  </div>
                )}

                {/* Info section — shown when loaded without error */}
                {!isLoading && error === null && (
                  <div className="mt-6 p-3.5 rounded-lg bg-lg-control border border-lg-separator text-sm text-muted-foreground/90">
                    <p className="font-medium mb-1.5 text-foreground/80">How Skills Work</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>
                        Project skills live in{' '}
                        <code className="bg-lg-control px-1 py-0.5 rounded-md">
                          .claude/skills/
                        </code>
                      </li>
                      <li>
                        Personal skills live in{' '}
                        <code className="bg-lg-control px-1 py-0.5 rounded-md">
                          ~/.claude/skills/
                        </code>
                      </li>
                      <li>Each skill is a SKILL.md file with YAML frontmatter</li>
                      <li>Skills are automatically loaded when matched by triggers</li>
                    </ul>
                  </div>
                )}
              </div>
            </DialogPrimitive.Content>
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
};

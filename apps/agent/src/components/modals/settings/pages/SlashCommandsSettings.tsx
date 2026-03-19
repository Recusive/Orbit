import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Edit2, Loader2, Lock, Plus, Slash, Sparkles, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  CommandScope,
  ExtensionMessage,
  SlashCommandDefinition,
  WebviewMessage,
} from '@/types/protocol';
import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import { DialogOverlay } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useTauri } from '@/hooks/agent/use-tauri';
import { useSmoothScroll } from '@/hooks/ui';
import { cn } from '@/lib/utils';
import {
  useCommandsStore,
  useCommands,
  useCommandsLoading,
  useCommandsHasFetched,
} from '@/stores/agent';

// Available tools that can be selected
const AVAILABLE_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Grep',
  'Glob',
  'WebFetch',
  'WebSearch',
  'Task',
  'TodoWrite',
  'AskUserQuestion',
];

// Scope labels and styles
const SCOPE_CONFIG: Record<CommandScope, { label: string; className: string }> = {
  builtin: { label: 'Built-in', className: 'bg-info-muted text-info' },
  default: { label: 'Default', className: 'bg-purple-500/10 text-purple-500' },
  project: { label: 'Project', className: 'bg-success-muted text-success' },
  personal: { label: 'Personal', className: 'bg-orange-500/10 text-orange-500' },
};

// Section header
interface SectionHeaderProps {
  readonly title: string;
  readonly children?: React.ReactNode;
}

const SectionHeader: FC<SectionHeaderProps> = ({ title, children }) => (
  <div className="mb-5">
    <h3 className="text-base font-semibold mb-1.5">{title}</h3>
    {children !== undefined && (
      <p className="text-sm text-muted-foreground/90 leading-relaxed">{children}</p>
    )}
  </div>
);

// Command card component
interface CommandCardProps {
  readonly command: SlashCommandDefinition;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

const CommandCard: FC<CommandCardProps> = ({ command, onEdit, onDelete }) => {
  const isReadonly =
    command.readonly === true || command.scope === 'builtin' || command.scope === 'default';
  const scopeConfig = SCOPE_CONFIG[command.scope];

  return (
    <div className="rounded-[9px] bg-lg-control p-4 hover:bg-lg-control-hover transition-[background-color] duration-150">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="h-8 w-8 rounded-lg bg-lg-control flex items-center justify-center shrink-0">
            <Slash className="h-3.5 w-3.5 -rotate-25 text-lg-text-secondary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-base truncate">/{command.name}</span>
              <span className={cn('text-xs px-1.5 py-0.5 rounded-md', scopeConfig.className)}>
                {scopeConfig.label}
              </span>
              {isReadonly ? <Lock className="h-3 w-3 text-muted-foreground/80" /> : null}
            </div>
            <div className="text-sm text-muted-foreground/90 line-clamp-2 mt-1">
              {command.description ?? 'No description'}
            </div>
            {command.argumentHint !== undefined && command.argumentHint !== '' && (
              <div className="text-xs text-muted-foreground/80 mt-1.5 font-mono">
                /{command.name} {command.argumentHint}
              </div>
            )}
            {command.allowedTools !== undefined && command.allowedTools.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {command.allowedTools.slice(0, 4).map((tool) => (
                  <span
                    key={tool}
                    className="text-xs px-1.5 py-0.5 rounded-md bg-lg-control text-muted-foreground/90"
                  >
                    {tool}
                  </span>
                ))}
                {command.allowedTools.length > 4 && (
                  <span className="text-xs px-1.5 py-0.5 rounded-md bg-lg-control text-muted-foreground/90">
                    +{command.allowedTools.length - 4} more
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {!isReadonly && (
          <div className="flex items-center shrink-0 border border-lg-separator/50 rounded-[7px] overflow-hidden">
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-none" onClick={onEdit}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <div className="w-px h-4 bg-lg-separator/50" />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-none text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

// Command editor dialog
interface CommandEditorProps {
  readonly command: SlashCommandDefinition | undefined;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSave: (command: SlashCommandDefinition, originalName?: string) => void;
  readonly postMessage: (message: WebviewMessage) => void;
  readonly onGeneratedCommand: (callback: (command: SlashCommandDefinition) => void) => void;
}

const CommandEditor: FC<CommandEditorProps> = ({
  command,
  isOpen,
  onClose,
  onSave,
  postMessage,
  onGeneratedCommand,
}) => {
  const smoothScrollRef = useSmoothScroll(0.08);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [argumentHint, setArgumentHint] = useState('');
  const [tools, setTools] = useState<string[]>([]);
  const [model, setModel] = useState<'claude-sonnet-4-6' | 'claude-opus-4-6' | 'haiku' | 'none'>(
    'none'
  );
  const [scope, setScope] = useState<'project' | 'personal'>('project');

  // AI Generation state
  const [showGenerateInput, setShowGenerateInput] = useState(false);
  const [generateDescription, setGenerateDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Reset form when command changes or dialog opens
  useEffect(() => {
    if (isOpen) {
      setName(command?.name ?? '');
      setDescription(command?.description ?? '');
      setContent(command?.content ?? '');
      setArgumentHint(command?.argumentHint ?? '');
      setTools(command?.allowedTools ?? []);
      setModel(command?.model ?? 'none');
      // Only allow project or personal scope for editing
      const cmdScope = command?.scope;
      setScope(cmdScope === 'project' || cmdScope === 'personal' ? cmdScope : 'project');
      setShowGenerateInput(false);
      setGenerateDescription('');
      setIsGenerating(false);
    }
  }, [command, isOpen]);

  // Listen for generated command response
  useEffect(() => {
    if (!isOpen) return;

    const handleGenerated = (generatedCommand: SlashCommandDefinition): void => {
      setName(generatedCommand.name);
      setDescription(generatedCommand.description ?? '');
      setContent(generatedCommand.content);
      setArgumentHint(generatedCommand.argumentHint ?? '');
      setTools(generatedCommand.allowedTools ?? []);
      setModel(generatedCommand.model ?? 'none');
      setScope(
        generatedCommand.scope === 'project' || generatedCommand.scope === 'personal'
          ? generatedCommand.scope
          : 'project'
      );
      setIsGenerating(false);
      setShowGenerateInput(false);
      setGenerateDescription('');
    };

    onGeneratedCommand(handleGenerated);

    // Cleanup: Clear callback when dialog closes to prevent stale updates
    return () => {
      onGeneratedCommand(() => {
        // No-op - dialog is closed
      });
    };
  }, [isOpen, onGeneratedCommand]);

  const handleGenerate = (): void => {
    if (generateDescription.trim() === '') return;

    setIsGenerating(true);
    postMessage({
      type: 'commands:generate',
      uuid: crypto.randomUUID(),
      description: generateDescription.trim(),
    });
  };

  const handleToolToggle = (tool: string): void => {
    setTools((prev) => (prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]));
  };

  const handleSave = (): void => {
    if (name.trim() === '' || content.trim() === '') {
      return;
    }

    const newCommand: SlashCommandDefinition = {
      name: name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-'),
      description: description.trim() !== '' ? description.trim() : undefined,
      content: content.trim(),
      argumentHint: argumentHint.trim() !== '' ? argumentHint.trim() : undefined,
      allowedTools: tools.length > 0 ? tools : undefined,
      model: model !== 'none' ? model : undefined,
      scope,
    };

    onSave(newCommand, command?.name);
    onClose();
  };

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogOverlay className="z-60" />
        {/* Flexbox centering wrapper - avoids blurry text from transform translate(-50%) subpixel issues */}
        <div className="fixed inset-0 z-60 flex items-center justify-center pointer-events-none">
          <DialogPrimitive.Content
            data-settings-child-dialog="true"
            className="relative w-[600px] max-w-[90vw] max-h-[80vh] glass-popover bg-sidebar border-0 shadow-none rounded-[14px] pointer-events-auto"
            onPointerDownOutside={(e) => {
              e.preventDefault();
            }}
            onInteractOutside={(e) => {
              e.preventDefault();
            }}
          >
            <DialogPrimitive.Title className="sr-only">
              {command !== undefined ? 'Edit Slash Command' : 'Create Slash Command'}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              {command !== undefined
                ? 'Edit an existing slash command'
                : 'Create a new slash command'}
            </DialogPrimitive.Description>

            {/* Inner wrapper: overflow-hidden here constrains flex scroll without clipping glass border */}
            <div className="flex flex-col overflow-hidden rounded-[inherit] max-h-[80vh] bg-sidebar">
              {/* Header */}
              <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-lg-separator">
                <h2 className="font-semibold text-lg">
                  {command !== undefined ? 'Edit Slash Command' : 'Create Slash Command'}
                </h2>
                <DialogPrimitive.Close asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <X className="h-4 w-4" />
                  </Button>
                </DialogPrimitive.Close>
              </div>

              {/* Form */}
              <div
                ref={smoothScrollRef}
                className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain py-5 px-6"
              >
                <div className="space-y-5 px-px">
                  {/* Name */}
                  <div>
                    <label className="text-sm font-medium text-muted-foreground/90 uppercase tracking-tight">
                      Command Name <span className="text-destructive/70">*</span>
                    </label>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-muted-foreground/90 text-sm font-mono">/</span>
                      <Input
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                        }}
                        placeholder="my-command"
                        className="h-8 text-sm"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground/90 mt-1.5 leading-relaxed">
                      Used as the filename and command identifier. Use lowercase with dashes.
                    </p>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-sm font-medium text-muted-foreground/90 uppercase tracking-tight">
                      Description
                    </label>
                    <Input
                      value={description}
                      onChange={(e) => {
                        setDescription(e.target.value);
                      }}
                      placeholder="What does this command do?"
                      className="mt-1 h-8 text-sm"
                    />
                  </div>

                  {/* Argument Hint */}
                  <div>
                    <label className="text-sm font-medium text-muted-foreground/90 uppercase tracking-tight">
                      Argument Hint
                    </label>
                    <Input
                      value={argumentHint}
                      onChange={(e) => {
                        setArgumentHint(e.target.value);
                      }}
                      placeholder="[file] [options]"
                      className="mt-1 h-8 text-sm"
                    />
                    <p className="text-xs text-muted-foreground/90 mt-1.5 leading-relaxed">
                      Shows users what arguments this command accepts, e.g., &quot;[file]
                      [options]&quot;
                    </p>
                  </div>

                  {/* Content/Prompt */}
                  <div>
                    <label className="text-sm font-medium text-muted-foreground/90 uppercase tracking-tight">
                      Command Prompt <span className="text-destructive/70">*</span>
                    </label>
                    <Textarea
                      value={content}
                      onChange={(e) => {
                        setContent(e.target.value);
                      }}
                      placeholder="The prompt that will be sent to Claude when this command is run..."
                      className="mt-1 text-sm min-h-[120px] font-mono"
                    />
                    <p className="text-xs text-muted-foreground/90 mt-1.5 leading-relaxed">
                      Use{' '}
                      <code className="bg-lg-control px-1.5 py-0.5 rounded-md font-mono text-[9px] text-foreground/70">
                        $ARGUMENTS
                      </code>{' '}
                      for user input. Use{' '}
                      <code className="bg-lg-control px-1.5 py-0.5 rounded-md font-mono text-[9px] text-foreground/70">
                        @filename
                      </code>{' '}
                      to include file contents.
                    </p>
                  </div>

                  {/* Scope */}
                  <div>
                    <label className="text-sm font-medium text-muted-foreground/90 uppercase tracking-tight">
                      Scope
                    </label>
                    <Select
                      value={scope}
                      onValueChange={(v) => {
                        setScope(v as typeof scope);
                      }}
                    >
                      <SelectTrigger className="mt-1 h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-70">
                        <SelectItem value="project">
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-500/80" />
                            Project (.claude/commands/)
                          </span>
                        </SelectItem>
                        <SelectItem value="personal">
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-orange-500/80" />
                            Personal (~/.claude/commands/)
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground/90 mt-1.5 leading-relaxed">
                      Project commands are shared with the team. Personal commands are just for you.
                    </p>
                  </div>

                  {/* Model */}
                  <div>
                    <label className="text-sm font-medium text-muted-foreground/90 uppercase tracking-tight">
                      Model
                    </label>
                    <Select
                      value={model}
                      onValueChange={(v) => {
                        setModel(v as typeof model);
                      }}
                    >
                      <SelectTrigger className="mt-1 h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-70">
                        <SelectItem value="none">Use current model</SelectItem>
                        <SelectItem value="haiku">Haiku 4.5 (fast)</SelectItem>
                        <SelectItem value="claude-sonnet-4-6">Sonnet 4.6 (balanced)</SelectItem>
                        <SelectItem value="claude-opus-4-6">Opus 4.6 (best)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Tools */}
                  <div>
                    <label className="text-sm font-medium text-muted-foreground/90 uppercase tracking-tight">
                      Allowed Tools
                    </label>
                    <p className="text-xs text-muted-foreground/90 mb-2 mt-1">
                      Restrict which tools this command can use. Leave empty for all tools.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {AVAILABLE_TOOLS.map((tool) => (
                        <button
                          key={tool}
                          type="button"
                          onClick={() => {
                            handleToolToggle(tool);
                          }}
                          className={cn(
                            'text-sm px-2.5 py-1.5 rounded-full border-0 transition-[background-color,transform] duration-150 active:scale-[0.98]',
                            tools.includes(tool)
                              ? 'bg-[rgba(0,122,255,0.85)] text-white'
                              : 'bg-control-fill text-control-text hover:bg-control-fill-hover'
                          )}
                        >
                          {tool}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Generate with AI Input - Only show when creating new command and generate mode is active */}
                  {command === undefined && showGenerateInput ? (
                    <div className="p-3.5 rounded-[14px] border border-lg-separator bg-lg-control">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Sparkles className="h-4 w-4 text-lg-text-secondary" />
                          Generate with AI
                        </div>
                        <Textarea
                          value={generateDescription}
                          onChange={(e) => {
                            setGenerateDescription(e.target.value);
                          }}
                          placeholder="Describe what this command should do... e.g., 'A command that reviews code for security vulnerabilities and suggests fixes'"
                          className="text-sm min-h-[80px]"
                          disabled={isGenerating}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Footer */}
              <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3.5 border-t border-lg-separator">
                {/* Generate with AI button - only show when creating new command */}
                {command === undefined &&
                  (showGenerateInput ? (
                    <Button
                      variant={generateDescription.trim() !== '' ? 'default' : 'outline'}
                      size="sm"
                      onClick={handleGenerate}
                      disabled={generateDescription.trim() === '' || isGenerating}
                      className="mr-auto gap-1.5"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          Generate
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowGenerateInput(true);
                      }}
                      className="mr-auto gap-1.5"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-amber-500/70" />
                      Generate with AI
                    </Button>
                  ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (showGenerateInput) {
                      setShowGenerateInput(false);
                      setGenerateDescription('');
                    } else {
                      onClose();
                    }
                  }}
                  disabled={isGenerating}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={name.trim() === '' || content.trim() === '' || isGenerating}
                >
                  {command !== undefined ? 'Save Changes' : 'Create Command'}
                </Button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

// Main SlashCommandsSettings component
export const SlashCommandsSettings: FC = () => {
  // Use centralized commands store (prevents duplicate IPC calls)
  const commands = useCommands();
  const isLoading = useCommandsLoading();
  const hasFetched = useCommandsHasFetched();
  const { fetchCommands, addCommand, updateCommand, removeCommand } = useCommandsStore();

  // Initial load state: loading and haven't fetched yet
  const isInitialLoad = isLoading && !hasFetched;

  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<SlashCommandDefinition | undefined>(
    undefined
  );

  // Callback ref for generated command handler
  const generatedCommandCallbackRef = useRef<((command: SlashCommandDefinition) => void) | null>(
    null
  );

  // Message handler for command CRUD operations (store handles list response)
  // Note: Using store actions directly avoids stale closure issues
  const handleMessage = useCallback(
    (message: ExtensionMessage): void => {
      if (message.type === 'commands:created') {
        addCommand(message.command);
        setError(null);
      } else if (message.type === 'commands:updated') {
        updateCommand(message.command);
        setError(null);
      } else if (message.type === 'commands:deleted') {
        // Get current commands from store to find scope
        const currentCommands = useCommandsStore.getState().commands;
        const deletedCmd = currentCommands.find((c) => c.name === message.name);
        if (deletedCmd) {
          removeCommand(message.name, deletedCmd.scope);
        }
        setError(null);
      } else if (message.type === 'commands:error') {
        setError(message.error);
      } else if (message.type === 'commands:generated') {
        // Call the registered callback with the generated command
        if (generatedCommandCallbackRef.current) {
          generatedCommandCallbackRef.current(message.command);
        }
      }
      // Ignore other message types (list:response is handled by store)
    },
    [addCommand, updateCommand, removeCommand]
  );

  // Register callback for generated command
  const handleRegisterGeneratedCallback = useCallback(
    (callback: (command: SlashCommandDefinition) => void): void => {
      generatedCommandCallbackRef.current = callback;
    },
    []
  );

  // Use Tauri API for CRUD operations
  const { postMessage } = useTauri({ onMessage: handleMessage });

  // Fetch commands on mount (store handles deduplication)
  useEffect(() => {
    void fetchCommands();
  }, [fetchCommands]);

  const handleCreateCommand = useCallback((): void => {
    setEditingCommand(undefined);
    setEditorOpen(true);
  }, []);

  const handleEditCommand = useCallback((command: SlashCommandDefinition): void => {
    setEditingCommand(command);
    setEditorOpen(true);
  }, []);

  const handleDeleteCommand = useCallback(
    (name: string, scope: 'project' | 'personal'): void => {
      postMessage({
        type: 'commands:delete',
        uuid: crypto.randomUUID(),
        name,
        scope,
      });
    },
    [postMessage]
  );

  const handleSaveCommand = useCallback(
    (command: SlashCommandDefinition, originalName?: string): void => {
      if (originalName !== undefined) {
        // Update existing
        postMessage({
          type: 'commands:update',
          uuid: crypto.randomUUID(),
          originalName,
          command,
        });
      } else {
        // Create new
        postMessage({
          type: 'commands:create',
          uuid: crypto.randomUUID(),
          command,
        });
      }
    },
    [postMessage]
  );

  // Group commands by scope
  const builtinCommands = commands.filter((c) => c.scope === 'builtin');
  const defaultCommands = commands.filter((c) => c.scope === 'default');
  const projectCommands = commands.filter((c) => c.scope === 'project');
  const personalCommands = commands.filter((c) => c.scope === 'personal');

  // Skeleton loading state
  if (isInitialLoad) {
    return (
      <div>
        <SectionHeader title="Slash Commands">
          Custom commands that expand into prompts. Type / in the chat to see available commands.
        </SectionHeader>
        <div className="space-y-3">
          <div className="h-9 w-full rounded-md bg-lg-control animate-pulse" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border border-lg-separator p-4">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-lg-control animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 rounded bg-lg-control animate-pulse" />
                    <div className="h-3 w-48 rounded bg-lg-control animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-settings-in">
      <SectionHeader title="Slash Commands">
        Custom commands that expand into prompts. Type / in the chat to see available commands.
      </SectionHeader>

      {error !== null && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-base">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {/* Create button */}
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={handleCreateCommand}
        >
          <Plus className="h-4 w-4" />
          Create New Command
        </Button>

        {/* Command list */}
        <div className="space-y-6">
          {/* Personal Commands */}
          {personalCommands.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground/90 mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-orange-500" />
                Personal Commands
              </div>
              <div className="space-y-2">
                {personalCommands.map((command) => (
                  <CommandCard
                    key={`${command.scope}-${command.name}`}
                    command={command}
                    onEdit={() => {
                      handleEditCommand(command);
                    }}
                    onDelete={() => {
                      handleDeleteCommand(command.name, 'personal');
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Project Commands */}
          {projectCommands.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground/90 mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                Project Commands
              </div>
              <div className="space-y-2">
                {projectCommands.map((command) => (
                  <CommandCard
                    key={`${command.scope}-${command.name}`}
                    command={command}
                    onEdit={() => {
                      handleEditCommand(command);
                    }}
                    onDelete={() => {
                      handleDeleteCommand(command.name, 'project');
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Default Commands */}
          {defaultCommands.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground/90 mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-purple-500" />
                Default Commands
                <Lock className="h-3 w-3" />
              </div>
              <div className="space-y-2">
                {defaultCommands.map((command) => (
                  <CommandCard
                    key={`${command.scope}-${command.name}`}
                    command={command}
                    onEdit={() => {
                      /* readonly */
                    }}
                    onDelete={() => {
                      /* readonly */
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Built-in Commands */}
          {builtinCommands.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground/90 mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-info" />
                Built-in Commands
                <Lock className="h-3 w-3" />
              </div>
              <div className="space-y-2">
                {builtinCommands.map((command) => (
                  <CommandCard
                    key={`${command.scope}-${command.name}`}
                    command={command}
                    onEdit={() => {
                      /* readonly */
                    }}
                    onDelete={() => {
                      /* readonly */
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {commands.length === 0 && (
            <div className="text-center py-8 text-muted-foreground/90 text-sm">
              <Slash className="h-8 w-8 mx-auto mb-2 opacity-50 -rotate-25" />
              <p>No commands available.</p>
              <p className="text-xs mt-1">Create a command to quickly run common prompts.</p>
            </div>
          )}
        </div>
      </div>

      {/* Info section */}
      <div className="mt-6 p-3 rounded-[12px] bg-lg-control text-sm text-muted-foreground/70">
        <p className="font-medium mb-1 text-foreground/70">How Slash Commands Work</p>
        <ul className="list-disc list-inside space-y-0.5 text-[12px]">
          <li>
            Project commands are stored in{' '}
            <code className="bg-lg-control-hover px-1 rounded-md">.claude/commands/</code>
          </li>
          <li>
            Personal commands are stored in{' '}
            <code className="bg-lg-control-hover px-1 rounded-md">~/.claude/commands/</code>
          </li>
          <li>
            Type <code className="bg-lg-control-hover px-1 rounded-md">/command-name</code> in chat
            to run
          </li>
          <li>
            Use <code className="bg-lg-control-hover px-1 rounded-md">$ARGUMENTS</code> to pass user
            input
          </li>
          <li>
            Use <code className="bg-lg-control-hover px-1 rounded-md">@filename</code> to include
            file contents
          </li>
        </ul>
      </div>

      {/* Editor dialog */}
      <CommandEditor
        command={editingCommand}
        isOpen={editorOpen}
        onClose={() => {
          setEditorOpen(false);
        }}
        onSave={handleSaveCommand}
        postMessage={postMessage}
        onGeneratedCommand={handleRegisterGeneratedCallback}
      />
    </div>
  );
};

export default SlashCommandsSettings;

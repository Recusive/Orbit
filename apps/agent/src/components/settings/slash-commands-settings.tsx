import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Edit2, Loader2, Lock, Plus, Sparkles, Terminal, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  CommandScope,
  ExtensionMessage,
  SlashCommandDefinition,
  WebviewMessage,
} from '@/types/protocol';
import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useTauri } from '@/hooks/use-tauri';
import { cn } from '@/lib/utils';

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
  builtin: { label: 'Built-in', className: 'bg-blue-500/10 text-blue-500' },
  default: { label: 'Default', className: 'bg-purple-500/10 text-purple-500' },
  project: { label: 'Project', className: 'bg-green-500/10 text-green-500' },
  personal: { label: 'Personal', className: 'bg-orange-500/10 text-orange-500' },
};

// Section header
interface SectionHeaderProps {
  readonly title: string;
  readonly children?: React.ReactNode;
}

const SectionHeader: FC<SectionHeaderProps> = ({ title, children }) => (
  <div className="mb-4">
    <h3 className="text-sm font-semibold mb-1">{title}</h3>
    {children !== undefined && <p className="text-xs text-muted-foreground">{children}</p>}
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
    <div className="rounded-lg border border-border p-4 hover:bg-accent/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <Terminal className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">/{command.name}</span>
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded', scopeConfig.className)}>
                {scopeConfig.label}
              </span>
              {isReadonly ? <Lock className="h-3 w-3 text-muted-foreground" /> : null}
            </div>
            <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {command.description ?? 'No description'}
            </div>
            {command.argumentHint !== undefined && command.argumentHint !== '' && (
              <div className="text-[10px] text-muted-foreground mt-1 font-mono">
                /{command.name} {command.argumentHint}
              </div>
            )}
            {command.allowedTools !== undefined && command.allowedTools.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {command.allowedTools.slice(0, 4).map((tool) => (
                  <span
                    key={tool}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                  >
                    {tool}
                  </span>
                ))}
                {command.allowedTools.length > 4 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    +{command.allowedTools.length - 4} more
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {!isReadonly && (
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [argumentHint, setArgumentHint] = useState('');
  const [tools, setTools] = useState<string[]>([]);
  const [model, setModel] = useState<'sonnet' | 'opus' | 'haiku' | 'none'>('none');
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
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-[60] translate-x-[-50%] translate-y-[-50%] w-[600px] max-w-[90vw] max-h-[80vh] bg-background border border-border rounded-lg shadow-xl flex flex-col"
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

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-sm">
              {command !== undefined ? 'Edit Slash Command' : 'Create Slash Command'}
            </h2>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <X className="h-4 w-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          {/* Form */}
          <ScrollArea className="flex-1 py-4 px-5">
            <div className="space-y-4 px-px">
              {/* Name */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Command Name <span className="text-destructive">*</span>
                </label>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-muted-foreground">/</span>
                  <Input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                    }}
                    placeholder="my-command"
                    className="h-8 text-sm"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Used as the filename and command identifier. Use lowercase with dashes.
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Description</label>
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
                <label className="text-xs font-medium text-muted-foreground">Argument Hint</label>
                <Input
                  value={argumentHint}
                  onChange={(e) => {
                    setArgumentHint(e.target.value);
                  }}
                  placeholder="[file] [options]"
                  className="mt-1 h-8 text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Shows users what arguments this command accepts, e.g., &quot;[file]
                  [options]&quot;
                </p>
              </div>

              {/* Content/Prompt */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Command Prompt <span className="text-destructive">*</span>
                </label>
                <Textarea
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                  }}
                  placeholder="The prompt that will be sent to Claude when this command is run..."
                  className="mt-1 text-sm min-h-[120px] font-mono"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Use <code className="bg-muted px-1 rounded">$ARGUMENTS</code> for user input. Use{' '}
                  <code className="bg-muted px-1 rounded">@filename</code> to include file contents.
                </p>
              </div>

              {/* Scope */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Scope</label>
                <Select
                  value={scope}
                  onValueChange={(v) => {
                    setScope(v as typeof scope);
                  }}
                >
                  <SelectTrigger className="mt-1 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[70]">
                    <SelectItem value="project">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        Project (.claude/commands/)
                      </span>
                    </SelectItem>
                    <SelectItem value="personal">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-orange-500" />
                        Personal (~/.claude/commands/)
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Project commands are shared with the team. Personal commands are just for you.
                </p>
              </div>

              {/* Model */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Model</label>
                <Select
                  value={model}
                  onValueChange={(v) => {
                    setModel(v as typeof model);
                  }}
                >
                  <SelectTrigger className="mt-1 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[70]">
                    <SelectItem value="none">Use current model</SelectItem>
                    <SelectItem value="haiku">Haiku (fast)</SelectItem>
                    <SelectItem value="sonnet">Sonnet (balanced)</SelectItem>
                    <SelectItem value="opus">Opus (best)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Tools */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Allowed Tools</label>
                <p className="text-[10px] text-muted-foreground mb-2">
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
                        'text-xs px-2.5 py-1 rounded-md border transition-colors',
                        tools.includes(tool)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-foreground border-border hover:bg-accent'
                      )}
                    >
                      {tool}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate with AI Input - Only show when creating new command and generate mode is active */}
              {command === undefined && showGenerateInput ? (
                <div className="p-3 rounded-lg border border-primary/30 bg-primary/5">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Sparkles className="h-4 w-4 text-primary" />
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
          </ScrollArea>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
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
                  <Sparkles className="h-3.5 w-3.5" />
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
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

// Main SlashCommandsSettings component
export const SlashCommandsSettings: FC = () => {
  const [commands, setCommands] = useState<SlashCommandDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<SlashCommandDefinition | undefined>(
    undefined
  );

  // Use ref for the initial fetch flag to avoid re-fetching
  const hasFetched = useRef(false);

  // Callback ref for generated command handler
  const generatedCommandCallbackRef = useRef<((command: SlashCommandDefinition) => void) | null>(
    null
  );

  // Message handler for command-related messages
  const handleMessage = useCallback((message: ExtensionMessage): void => {
    if (message.type === 'commands:list:response') {
      setCommands(message.commands);
      setIsLoading(false);
      setError(null);
    } else if (message.type === 'commands:created') {
      setCommands((prev) => [...prev, message.command]);
      setError(null);
    } else if (message.type === 'commands:updated') {
      setCommands((prev) =>
        prev.map((c) =>
          c.name === message.command.name && c.scope === message.command.scope ? message.command : c
        )
      );
      setError(null);
    } else if (message.type === 'commands:deleted') {
      setCommands((prev) => prev.filter((c) => c.name !== message.name));
      setError(null);
    } else if (message.type === 'commands:error') {
      setError(message.error);
      setIsLoading(false);
    } else if (message.type === 'commands:generated') {
      // Call the registered callback with the generated command
      if (generatedCommandCallbackRef.current) {
        generatedCommandCallbackRef.current(message.command);
      }
    }
    // Ignore other message types
  }, []);

  // Register callback for generated command
  const handleRegisterGeneratedCallback = useCallback(
    (callback: (command: SlashCommandDefinition) => void): void => {
      generatedCommandCallbackRef.current = callback;
    },
    []
  );

  // Use VS Code API with message handler
  const { postMessage } = useTauri({ onMessage: handleMessage });

  // Fetch commands on mount
  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      postMessage({
        type: 'commands:list',
        uuid: crypto.randomUUID(),
      });
    }
  }, [postMessage]);

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

  return (
    <div>
      <SectionHeader title="Slash Commands">
        Custom commands that expand into prompts. Type / in the chat to see available commands.
      </SectionHeader>

      {error !== null && (
        <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {/* Create button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={handleCreateCommand}
        >
          <Plus className="h-4 w-4" />
          Create New Command
        </Button>

        {/* Command list */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading commands...</div>
        ) : (
          <div className="space-y-6">
            {/* Personal Commands */}
            {personalCommands.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
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
                <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
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
                <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
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
                <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
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
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No commands available.</p>
                <p className="text-xs mt-1">Create a command to quickly run common prompts.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info section */}
      <div className="mt-6 p-3 rounded-md bg-muted/50 text-xs text-muted-foreground">
        <p className="font-medium mb-1">How Slash Commands Work</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>
            Project commands are stored in{' '}
            <code className="bg-muted px-1 rounded">.claude/commands/</code>
          </li>
          <li>
            Personal commands are stored in{' '}
            <code className="bg-muted px-1 rounded">~/.claude/commands/</code>
          </li>
          <li>
            Type <code className="bg-muted px-1 rounded">/command-name</code> in chat to run
          </li>
          <li>
            Use <code className="bg-muted px-1 rounded">$ARGUMENTS</code> to pass user input
          </li>
          <li>
            Use <code className="bg-muted px-1 rounded">@filename</code> to include file contents
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

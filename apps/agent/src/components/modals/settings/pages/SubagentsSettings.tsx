import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Bot, Edit2, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ExtensionMessage, SubagentDefinition, WebviewMessage } from '@/types/protocol';
import type { FC } from 'react';

import { Button } from '@/components/ui/button';
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

// Agent card component
interface AgentCardProps {
  readonly agent: SubagentDefinition;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

const AgentCard: FC<AgentCardProps> = ({ agent, onEdit, onDelete }) => (
  <div className="rounded-lg border border-lg-separator p-4 hover:bg-lg-control-hover transition-[background-color] duration-150">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className="h-8 w-8 rounded-lg bg-lg-control flex items-center justify-center shrink-0">
          <Bot className="h-4 w-4 text-lg-text-secondary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-base truncate">{agent.name}</div>
          <div className="text-sm text-muted-foreground/90 line-clamp-2 mt-1 wrap-break-word">
            {agent.description || 'No description'}
          </div>
          {agent.tools !== undefined && agent.tools.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {agent.tools.slice(0, 4).map((tool) => (
                <span
                  key={tool}
                  className="text-xs px-1.5 py-0.5 rounded-md bg-lg-control text-muted-foreground/90"
                >
                  {tool}
                </span>
              ))}
              {agent.tools.length > 4 && (
                <span className="text-xs px-1.5 py-0.5 rounded-md bg-lg-control text-muted-foreground/90">
                  +{agent.tools.length - 4} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>
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
    </div>
  </div>
);

// Agent editor dialog
interface AgentEditorProps {
  readonly agent: SubagentDefinition | undefined;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSave: (agent: SubagentDefinition, originalName?: string) => void;
  readonly postMessage: (message: WebviewMessage) => void;
  readonly onGeneratedAgent: (callback: (agent: SubagentDefinition) => void) => void;
}

const AgentEditor: FC<AgentEditorProps> = ({
  agent,
  isOpen,
  onClose,
  onSave,
  postMessage,
  onGeneratedAgent,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [tools, setTools] = useState<string[]>([]);
  const [model, setModel] = useState<'claude-sonnet-4-6' | 'claude-opus-4-6' | 'haiku' | 'inherit'>(
    'inherit'
  );

  // AI Generation state
  const [showGenerateInput, setShowGenerateInput] = useState(false);
  const [generateDescription, setGenerateDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Reset form when agent changes or dialog opens
  useEffect(() => {
    if (isOpen) {
      setName(agent?.name ?? '');
      setDescription(agent?.description ?? '');
      setPrompt(agent?.prompt ?? '');
      setTools(agent?.tools ?? []);
      setModel(agent?.model ?? 'inherit');
      setShowGenerateInput(false);
      setGenerateDescription('');
      setIsGenerating(false);
    }
  }, [agent, isOpen]);

  // Listen for generated agent response
  useEffect(() => {
    if (!isOpen) return;

    const handleGenerated = (generatedAgent: SubagentDefinition): void => {
      setName(generatedAgent.name);
      setDescription(generatedAgent.description);
      setPrompt(generatedAgent.prompt);
      setTools(generatedAgent.tools ?? []);
      setModel(generatedAgent.model ?? 'inherit');
      setIsGenerating(false);
      setShowGenerateInput(false);
      setGenerateDescription('');
    };

    onGeneratedAgent(handleGenerated);

    // Cleanup: Clear callback when dialog closes to prevent stale updates
    return () => {
      onGeneratedAgent(() => {
        // No-op - dialog is closed
      });
    };
  }, [isOpen, onGeneratedAgent]);

  const handleGenerate = (): void => {
    if (generateDescription.trim() === '') return;

    setIsGenerating(true);
    postMessage({
      type: 'subagents:generate',
      uuid: crypto.randomUUID(),
      description: generateDescription.trim(),
    });
  };

  const handleToolToggle = (tool: string): void => {
    setTools((prev) => (prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]));
  };

  const handleSave = (): void => {
    if (name.trim() === '' || prompt.trim() === '') {
      return;
    }

    const newAgent: SubagentDefinition = {
      name: name.trim(),
      description: description.trim(),
      prompt: prompt.trim(),
      tools: tools.length > 0 ? tools : undefined,
      model: model !== 'inherit' ? model : undefined,
    };

    onSave(newAgent, agent?.name);
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
        <DialogPrimitive.Overlay className="fixed inset-0 z-60 bg-black/15 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        {/* Flexbox centering wrapper - avoids blurry text from transform translate(-50%) subpixel issues */}
        <div className="fixed inset-0 z-60 flex items-center justify-center pointer-events-none">
          <DialogPrimitive.Content
            className="relative w-[600px] max-w-[90vw] max-h-[80vh] glass-popover bg-transparent border-0 shadow-none rounded-[14px] pointer-events-auto"
            onPointerDownOutside={(e) => {
              e.preventDefault();
            }}
            onInteractOutside={(e) => {
              e.preventDefault();
            }}
          >
            <DialogPrimitive.Title className="sr-only">
              {agent !== undefined ? 'Edit Subagent' : 'Create Subagent'}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              {agent !== undefined
                ? 'Edit an existing subagent configuration'
                : 'Create a new subagent configuration'}
            </DialogPrimitive.Description>

            {/* Inner wrapper: overflow-hidden here constrains flex scroll without clipping glass border */}
            <div className="flex flex-col overflow-hidden rounded-[inherit] max-h-[80vh] bg-chat-area">
              {/* Header */}
              <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-lg-separator">
                <h2 className="font-semibold text-lg">
                  {agent !== undefined ? 'Edit Subagent' : 'Create Subagent'}
                </h2>
                <DialogPrimitive.Close asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <X className="h-4 w-4" />
                  </Button>
                </DialogPrimitive.Close>
              </div>

              {/* Form */}
              <div className="flex-1 min-h-0 overflow-y-auto py-5 px-6">
                <div className="space-y-5 px-px">
                  {/* Name */}
                  <div>
                    <label className="text-sm font-medium text-muted-foreground/90 uppercase tracking-tight">
                      Name <span className="text-red-500/70">*</span>
                    </label>
                    <Input
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                      }}
                      placeholder="code-reviewer"
                      className="mt-1 h-8 text-sm"
                    />
                    <p className="text-xs text-muted-foreground/90 mt-1.5 leading-relaxed">
                      Used as the filename and identifier. Use lowercase with dashes.
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
                      placeholder="Expert code review specialist for quality and security"
                      className="mt-1 h-8 text-sm"
                    />
                    <p className="text-xs text-muted-foreground/90 mt-1.5 leading-relaxed">
                      Describes when this agent should be used. Claude uses this to decide when to
                      invoke it.
                    </p>
                  </div>

                  {/* Prompt */}
                  <div>
                    <label className="text-sm font-medium text-muted-foreground/90 uppercase tracking-tight">
                      System Prompt <span className="text-red-500/70">*</span>
                    </label>
                    <Textarea
                      value={prompt}
                      onChange={(e) => {
                        setPrompt(e.target.value);
                      }}
                      placeholder="You are a code review specialist with expertise in security, performance, and best practices..."
                      className="mt-1 text-sm min-h-[120px]"
                    />
                    <p className="text-xs text-muted-foreground/90 mt-1.5 leading-relaxed">
                      Instructions that define the agent&apos;s behavior and expertise.
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
                        <SelectItem value="inherit">Inherit from parent</SelectItem>
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
                      Select which tools this agent can use. Leave empty to inherit all tools.
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
                              : 'bg-[var(--lg-alert-secondary-bg)] text-[var(--lg-alert-secondary-text)] hover:bg-[var(--lg-alert-secondary-bg-hover)]'
                          )}
                        >
                          {tool}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Generate with AI Input - Only show when creating new agent and generate mode is active */}
                  {agent === undefined && showGenerateInput ? (
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
                          placeholder="Describe what this agent should do... e.g., 'An expert code reviewer that focuses on security vulnerabilities and best practices'"
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
                {/* Generate with AI button - only show when creating new agent */}
                {agent === undefined &&
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
                  disabled={name.trim() === '' || prompt.trim() === '' || isGenerating}
                >
                  {agent !== undefined ? 'Save Changes' : 'Create Agent'}
                </Button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

// Main SubagentsSettings component
export const SubagentsSettings: FC = () => {
  const [agents, setAgents] = useState<SubagentDefinition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<SubagentDefinition | undefined>(undefined);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Use ref for the initial fetch flag to avoid re-fetching
  const hasFetched = useRef(false);

  // Callback ref for generated agent handler
  const generatedAgentCallbackRef = useRef<((agent: SubagentDefinition) => void) | null>(null);

  // Message handler for subagent-related messages
  const handleMessage = useCallback((message: ExtensionMessage): void => {
    if (message.type === 'subagents:list:response') {
      setAgents(message.agents);
      setError(null);
      setIsInitialLoad(false);
    } else if (message.type === 'subagents:created') {
      setAgents((prev) => [...prev, message.agent]);
      setError(null);
    } else if (message.type === 'subagents:updated') {
      setAgents((prev) => prev.map((a) => (a.name === message.agent.name ? message.agent : a)));
      setError(null);
    } else if (message.type === 'subagents:deleted') {
      setAgents((prev) => prev.filter((a) => a.name !== message.name));
      setError(null);
    } else if (message.type === 'subagents:error') {
      setError(message.error);
    } else if (message.type === 'subagents:generated') {
      // Call the registered callback with the generated agent
      if (generatedAgentCallbackRef.current) {
        generatedAgentCallbackRef.current(message.agent);
      }
    }
    // Ignore other message types
  }, []);

  // Register callback for generated agent
  const handleRegisterGeneratedCallback = useCallback(
    (callback: (agent: SubagentDefinition) => void): void => {
      generatedAgentCallbackRef.current = callback;
    },
    []
  );

  // Use VS Code API with message handler
  const { postMessage } = useTauri({ onMessage: handleMessage });

  // Fetch agents on mount
  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      postMessage({
        type: 'subagents:list',
        uuid: crypto.randomUUID(),
      });
    }
  }, [postMessage]);

  const handleCreateAgent = useCallback((): void => {
    setEditingAgent(undefined);
    setEditorOpen(true);
  }, []);

  const handleEditAgent = useCallback((agent: SubagentDefinition): void => {
    setEditingAgent(agent);
    setEditorOpen(true);
  }, []);

  const handleDeleteAgent = useCallback(
    (name: string): void => {
      postMessage({
        type: 'subagents:delete',
        uuid: crypto.randomUUID(),
        name,
      });
    },
    [postMessage]
  );

  const handleSaveAgent = useCallback(
    (agent: SubagentDefinition, originalName?: string): void => {
      if (originalName !== undefined) {
        // Update existing
        postMessage({
          type: 'subagents:update',
          uuid: crypto.randomUUID(),
          originalName,
          agent,
        });
      } else {
        // Create new
        postMessage({
          type: 'subagents:create',
          uuid: crypto.randomUUID(),
          agent,
        });
      }
    },
    [postMessage]
  );

  // Skeleton loading state
  if (isInitialLoad) {
    return (
      <div>
        <SectionHeader title="Subagents">
          Custom agents that can be invoked via the Task tool for specialized tasks. Subagents
          maintain separate context and can run in parallel.
        </SectionHeader>
        <div className="space-y-3">
          <div className="h-9 w-full rounded-md bg-lg-control animate-pulse" />
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-lg border border-lg-separator p-4">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-lg-control animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-28 rounded bg-lg-control animate-pulse" />
                    <div className="h-3 w-40 rounded bg-lg-control animate-pulse" />
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
    <div>
      <SectionHeader title="Subagents">
        Custom agents that can be invoked via the Task tool for specialized tasks. Subagents
        maintain separate context and can run in parallel.
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
          size="sm"
          className="w-full justify-start gap-2"
          onClick={handleCreateAgent}
        >
          <Plus className="h-4 w-4" />
          Create New Subagent
        </Button>

        {/* Agent list */}
        {agents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground/90 text-base">
            <Bot className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>No subagents defined yet.</p>
            <p className="text-sm mt-1">Create a subagent to extend Claude&apos;s capabilities.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {agents.map((agent) => (
              <AgentCard
                key={agent.name}
                agent={agent}
                onEdit={() => {
                  handleEditAgent(agent);
                }}
                onDelete={() => {
                  handleDeleteAgent(agent.name);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Info section */}
      <div className="mt-6 p-3.5 rounded-lg bg-lg-control border border-lg-separator text-sm text-muted-foreground/90">
        <p className="font-medium mb-1.5 text-foreground/80">How Subagents Work</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>
            Subagents are stored in{' '}
            <code className="bg-lg-control px-1 py-0.5 rounded-md">.claude/agents/</code>
          </li>
          <li>Claude automatically invokes them based on the description</li>
          <li>You can explicitly request them: &quot;Use the code-reviewer agent&quot;</li>
          <li>Each subagent maintains its own context</li>
        </ul>
      </div>

      {/* Editor dialog */}
      <AgentEditor
        agent={editingAgent}
        isOpen={editorOpen}
        onClose={() => {
          setEditorOpen(false);
        }}
        onSave={handleSaveAgent}
        postMessage={postMessage}
        onGeneratedAgent={handleRegisterGeneratedCallback}
      />
    </div>
  );
};

export default SubagentsSettings;

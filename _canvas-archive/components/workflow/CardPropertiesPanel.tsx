/**
 * CardPropertiesPanel - Properties tab for the selected workflow card
 * Redesigned with shadcn/ui style components
 */

import {
  Clock,
  FileText,
  FolderOpen,
  Layers,
  Link2,
  Lock,
  RefreshCw,
  Tag,
  Trash2,
  Unlink,
  Unlock,
  X,
} from 'lucide-react';
import React, { useCallback, useState } from 'react';

import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

import type { CardType, FileSyncMode, MarkdownCard } from '../../types/workflowTypes';

// ============================================================================
// Card Type Icons (matching central-icons style)
// ============================================================================

const PromptIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg
    className={className}
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M13 7H20C20.5523 7 21 7.44772 21 8V16C21 16.5523 20.5523 17 20 17H13" />
    <path d="M5 7H4C3.44772 7 3 7.44772 3 8V16C3 16.5523 3.44772 17 4 17H5" />
    <path d="M9 4V20" />
  </svg>
);

const ResponseIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg
    className={className}
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 18H7M4 12H9M4 6H20M17 10L18.5 13.5L22 15L18.5 16.5L17 20L15.5 16.5L12 15L15.5 13.5L17 10Z" />
  </svg>
);

const DecisionIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg
    className={className}
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinejoin="round"
  >
    <path d="M10.6531 4.7751C11.2722 4.29172 11.9506 4.01127 12.5644 4C13.6656 4.01409 14.4651 4.37768 15.133 5.08936C15.3952 5.36995 15.8688 5.33915 16.2171 5.37826C17.3973 5.51355 18.1731 6.2506 18.6697 7.33997C19.1439 8.38175 20.3864 8.62313 20.7931 9.85974C20.9999 10.4855 21.0776 11.1351 20.9051 11.7552C20.7615 12.2654 20.8972 12.7191 20.9525 13.1927C21.0776 14.2609 20.8102 15.191 20.1029 15.952C19.8118 16.2635 19.4601 16.5115 19.1347 16.7849C18.6184 17.2203 18.0454 17.5276 17.3881 17.6149C16.8151 17.691 16.2553 17.6319 15.7218 17.3585C15.6269 17.3091 15.4649 17.3246 15.3688 17.3796C14.0687 18.1128 13.1445 18.7408 11.5646 18.08C10.4445 17.6235 9.30581 19.4375 8.78804 20.4147C8.6021 20.7656 8.24342 21 7.84627 21H7.1613C6.54989 21 6.13506 20.467 6.2619 19.8689C6.38172 19.3038 6.45434 18.7124 6.24698 18.4704C5.87948 18.0434 5.51329 17.6008 5.08651 17.2457C4.06039 16.3903 3.59541 15.2981 3.68762 13.9128C3.70211 13.7 3.602 13.4731 3.52955 13.2617C3.3728 12.8051 3.11989 12.3682 3.04745 11.8989C2.85513 10.6532 3.25425 9.60184 4.12098 8.74219C4.29881 8.56744 4.46346 8.33773 4.54645 8.09815C5.2156 6.15759 6.51965 5.04568 8.40987 4.77228C9.00262 4.68631 9.62566 4.8512 10.2355 4.8822C10.3738 4.88925 10.5451 4.85965 10.6531 4.7751Z" />
  </svg>
);

const DiagramIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg
    className={className}
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M12 8.5V12M12 12H7C6.44772 12 6 12.4477 6 13V15.5M12 12H17C17.5523 12 18 12.4477 18 13V15.5" />
  </svg>
);

const CodeIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg
    className={className}
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10 20L14 4M18 8.00004L21.2929 11.2929C21.6834 11.6835 21.6834 12.3166 21.2929 12.7071L18 16M6 16L2.70711 12.7071C2.31658 12.3166 2.31658 11.6835 2.70711 11.2929L6 8.00004" />
  </svg>
);

const DocumentIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg
    className={className}
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 5H4C3.44772 5 3 5.44772 3 6V18C3 18.5523 3.44772 19 4 19H20C20.5523 19 21 18.5523 21 18V6C21 5.44772 20.5523 5 20 5Z" />
    <path d="M16 10V14L17.5 12.75" />
    <path d="M16 14L14.5 12.75" />
    <path d="M7 14V10L9.25 12L11.5 10V14" />
  </svg>
);

// ============================================================================
// Types
// ============================================================================

interface CardPropertiesPanelProps {
  card: MarkdownCard | null;
  onUpdate: (cardId: string, updates: Partial<MarkdownCard>) => void;
  onDelete: (cardId: string) => void;
  onLinkFile?: (cardId: string, filePath: string, syncMode: FileSyncMode) => void;
  onUnlinkFile?: (cardId: string) => void;
  onSyncFile?: (cardId: string) => void;
  onResolveConflict?: (cardId: string, resolution: 'keep-card' | 'keep-file' | 'merge') => void;
  onBrowseFile?: () => Promise<string | undefined>;
}

interface CardTypeOption {
  type: CardType;
  label: string;
  icon: React.FC<{ className?: string }>;
  shortcut: string;
}

// ============================================================================
// Constants
// ============================================================================

const CARD_TYPES: CardTypeOption[] = [
  { type: 'prompt', label: 'Prompt', icon: PromptIcon, shortcut: '1' },
  { type: 'response', label: 'Response', icon: ResponseIcon, shortcut: '2' },
  { type: 'decision', label: 'Decision', icon: DecisionIcon, shortcut: '3' },
  { type: 'diagram', label: 'Diagram', icon: DiagramIcon, shortcut: '4' },
  { type: 'code-snippet', label: 'Code', icon: CodeIcon, shortcut: '5' },
  { type: 'document', label: 'Document', icon: DocumentIcon, shortcut: '6' },
];

const SYNC_MODES: { mode: FileSyncMode; label: string; description: string }[] = [
  { mode: 'bidirectional', label: 'Bidirectional', description: 'Changes sync both ways' },
  { mode: 'read', label: 'Read Only', description: 'Pull changes from file' },
  { mode: 'write', label: 'Write Only', description: 'Push changes to file' },
  { mode: 'none', label: 'No Sync', description: 'Link without syncing' },
];

// ============================================================================
// Helper Components
// ============================================================================

function EmptyState(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="px-6 py-5">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground/70">
          Properties
        </p>
        <p className="mt-0.5 text-sm font-medium text-foreground">Card Inspector</p>
      </div>

      {/* Empty State - Welcoming design */}
      <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-lg bg-gradient-to-br from-muted to-muted/50">
          <Layers className="h-9 w-9 text-muted-foreground/60" />
        </div>
        <p className="mb-2 text-xl font-medium text-foreground/80">No card selected</p>
        <p className="text-base leading-relaxed text-muted-foreground/70">
          Click on a card to view and edit its properties
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function CardPropertiesPanel({
  card,
  onUpdate,
  onDelete,
  onLinkFile,
  onUnlinkFile,
  onSyncFile,
  onResolveConflict,
  onBrowseFile,
}: CardPropertiesPanelProps): React.JSX.Element {
  // State
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [newTag, setNewTag] = useState('');
  const [fileLinkPath, setFileLinkPath] = useState('');
  const [selectedSyncMode, setSelectedSyncMode] = useState<FileSyncMode>('bidirectional');

  // Section state
  const [typeOpen, setTypeOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(true);
  const [fileOpen, setFileOpen] = useState(true);
  const [timestampsOpen, setTimestampsOpen] = useState(false);

  // Format timestamp
  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Handlers
  const handleStartEditName = useCallback((): void => {
    if (card !== null) {
      setNameValue(card.name);
      setEditingName(true);
    }
  }, [card]);

  const handleSaveName = useCallback((): void => {
    if (card !== null && nameValue.trim() !== '') {
      onUpdate(card.id, { name: nameValue.trim() });
    }
    setEditingName(false);
  }, [card, nameValue, onUpdate]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter') {
        handleSaveName();
      } else if (e.key === 'Escape') {
        setEditingName(false);
      }
    },
    [handleSaveName]
  );

  const handleTypeChange = useCallback(
    (type: CardType): void => {
      if (card !== null) {
        onUpdate(card.id, { type });
      }
    },
    [card, onUpdate]
  );

  const handleAddTag = useCallback((): void => {
    if (card !== null && newTag.trim() !== '') {
      const updatedTags = [...card.tags, newTag.trim()];
      onUpdate(card.id, { tags: updatedTags });
      setNewTag('');
    }
  }, [card, newTag, onUpdate]);

  const handleRemoveTag = useCallback(
    (tagToRemove: string): void => {
      if (card !== null) {
        const updatedTags = card.tags.filter((t) => t !== tagToRemove);
        onUpdate(card.id, { tags: updatedTags });
      }
    },
    [card, onUpdate]
  );

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddTag();
      }
    },
    [handleAddTag]
  );

  const handleToggleLock = useCallback((): void => {
    if (card !== null) {
      onUpdate(card.id, { locked: !card.locked });
    }
  }, [card, onUpdate]);

  const handleDelete = useCallback((): void => {
    if (card !== null) {
      onDelete(card.id);
    }
  }, [card, onDelete]);

  const handleLinkFile = useCallback((): void => {
    if (card !== null && fileLinkPath.trim() !== '' && onLinkFile !== undefined) {
      onLinkFile(card.id, fileLinkPath.trim(), selectedSyncMode);
      setFileLinkPath('');
    }
  }, [card, fileLinkPath, selectedSyncMode, onLinkFile]);

  const handleUnlinkFile = useCallback((): void => {
    if (card !== null && onUnlinkFile !== undefined) {
      onUnlinkFile(card.id);
    }
  }, [card, onUnlinkFile]);

  const handleSyncFile = useCallback((): void => {
    if (card !== null && onSyncFile !== undefined) {
      onSyncFile(card.id);
    }
  }, [card, onSyncFile]);

  const handleResolveConflict = useCallback(
    (resolution: 'keep-card' | 'keep-file' | 'merge'): void => {
      if (card !== null && onResolveConflict !== undefined) {
        onResolveConflict(card.id, resolution);
      }
    },
    [card, onResolveConflict]
  );

  const handleSyncModeChange = useCallback(
    (mode: FileSyncMode): void => {
      if (card?.filePath !== undefined) {
        onUpdate(card.id, { fileSync: mode });
      } else {
        setSelectedSyncMode(mode);
      }
    },
    [card, onUpdate]
  );

  const handleBrowseFile = useCallback(async (): Promise<void> => {
    if (onBrowseFile === undefined) return;
    const selectedPath = await onBrowseFile();
    if (selectedPath !== undefined) {
      setFileLinkPath(selectedPath);
    }
  }, [onBrowseFile]);

  // Empty state
  if (card === null) {
    return <EmptyState />;
  }

  const currentType = CARD_TYPES.find((ct) => ct.type === card.type);
  const TypeIcon = currentType?.icon ?? PromptIcon;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card text-card-foreground">
      {/* Header - Modern, spacious design */}
      <div className="px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground/70">
              Properties
            </p>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-primary/5">
                <TypeIcon className="h-5 w-5 text-primary" />
              </div>
              <p className="text-xl font-medium text-foreground">{card.name}</p>
            </div>
          </div>
          {/* Lock toggle moved to header as icon */}
          <button
            onClick={handleToggleLock}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg',
              'transition-all duration-200 ease-out',
              'hover:bg-muted active:scale-95',
              card.locked ? 'text-amber-500' : 'text-muted-foreground/50'
            )}
            title={card.locked ? 'Unlock card' : 'Lock card'}
          >
            {card.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Name Section - Clean, spacious */}
        <div className="px-6 pb-2">
          <Label className="mb-2.5 block text-sm font-medium text-muted-foreground/70">Name</Label>
          {editingName ? (
            <Input
              type="text"
              value={nameValue}
              onChange={(e): void => {
                setNameValue(e.target.value);
              }}
              onBlur={handleSaveName}
              onKeyDown={handleNameKeyDown}
              autoFocus
              className="h-10 rounded-lg border-border/50 bg-muted/30 text-sm focus:bg-background focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]"
            />
          ) : (
            <div
              onClick={handleStartEditName}
              className={cn(
                'cursor-pointer rounded-lg px-3.5 py-2.5 text-sm text-foreground',
                'bg-muted/30 border border-transparent',
                'transition-all duration-200',
                'hover:bg-muted/50 hover:border-border/50'
              )}
            >
              {card.name}
            </div>
          )}
        </div>

        {/* Type Section */}
        <Collapsible open={typeOpen} onOpenChange={setTypeOpen}>
          <CollapsibleTrigger icon={<Layers className="h-4 w-4" />}>Type</CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid grid-cols-3 gap-2.5">
              {CARD_TYPES.map((ct) => {
                const Icon = ct.icon;
                const isActive = card.type === ct.type;
                return (
                  <button
                    key={ct.type}
                    onClick={(): void => {
                      handleTypeChange(ct.type);
                    }}
                    className={cn(
                      'relative flex flex-col items-center justify-center gap-1.5 rounded-lg p-3 text-xs',
                      'transition-all duration-200 ease-out',
                      'hover:scale-[1.02]',
                      'active:scale-[0.98]',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                        : 'bg-muted/50 text-foreground hover:bg-muted hover:shadow-md'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="font-medium">{ct.label}</span>
                  </button>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Tags Section */}
        <Collapsible open={tagsOpen} onOpenChange={setTagsOpen}>
          <CollapsibleTrigger icon={<Tag className="h-4 w-4" />}>Tags</CollapsibleTrigger>
          <CollapsibleContent>
            {card.tags.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {card.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="gap-1.5 rounded-lg px-2.5 py-1 pr-1.5"
                  >
                    {tag}
                    <button
                      onClick={(): void => {
                        handleRemoveTag(tag);
                      }}
                      className="ml-0.5 rounded-md p-0.5 transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                type="text"
                value={newTag}
                onChange={(e): void => {
                  setNewTag(e.target.value);
                }}
                onKeyDown={handleTagKeyDown}
                placeholder="Add a tag..."
                className="h-10 flex-1 rounded-lg border-border/50 bg-muted/30 text-sm placeholder:text-muted-foreground/50"
              />
              <Button
                size="sm"
                onClick={handleAddTag}
                disabled={newTag.trim() === ''}
                className="h-10 rounded-lg px-4 shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.98] disabled:opacity-40"
              >
                Add
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* File Link Section */}
        <Collapsible open={fileOpen} onOpenChange={setFileOpen}>
          <CollapsibleTrigger icon={<Link2 className="h-4 w-4" />}>Linked File</CollapsibleTrigger>
          <CollapsibleContent className="space-y-4">
            {/* Conflict Warning */}
            {card.fileConflict !== undefined && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4 text-sm">
                <p className="mb-2 font-semibold text-amber-600">File Conflict Detected</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  The file was modified externally. Choose how to resolve:
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(): void => {
                      handleResolveConflict('keep-card');
                    }}
                    className="h-8 rounded-lg text-xs"
                  >
                    Keep Card
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(): void => {
                      handleResolveConflict('keep-file');
                    }}
                    className="h-8 rounded-lg text-xs"
                  >
                    Use File
                  </Button>
                </div>
              </div>
            )}

            {card.filePath !== undefined ? (
              <>
                {/* Linked file display */}
                <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-4 py-3 text-xs">
                  <FileText className="h-5 w-5 flex-shrink-0 text-primary/70" />
                  <span className="flex-1 break-all text-foreground/80">{card.filePath}</span>
                </div>

                {/* Sync mode */}
                <Select
                  value={card.fileSync}
                  onValueChange={(value): void => {
                    handleSyncModeChange(value as FileSyncMode);
                  }}
                >
                  <SelectTrigger className="h-10 rounded-lg border-border/50 bg-muted/30 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SYNC_MODES.map((sm) => (
                      <SelectItem key={sm.mode} value={sm.mode}>
                        {sm.label} - {sm.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Last synced */}
                {card.lastFileSyncAt !== undefined && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Last synced: {formatDate(card.lastFileSyncAt)}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSyncFile}
                    disabled={card.fileSync === 'none' || onSyncFile === undefined}
                    className="h-10 flex-1 gap-2 rounded-lg shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.98]"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Sync Now
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleUnlinkFile}
                    disabled={onUnlinkFile === undefined}
                    className="h-10 gap-2 rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Unlink className="h-4 w-4" />
                    Unlink
                  </Button>
                </div>
              </>
            ) : (
              <>
                {/* File path input */}
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={fileLinkPath}
                    onChange={(e): void => {
                      setFileLinkPath(e.target.value);
                    }}
                    placeholder="/path/to/file.md"
                    className="h-10 flex-1 rounded-lg border-border/50 bg-muted/30 text-sm placeholder:text-muted-foreground/50"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(): void => {
                      void handleBrowseFile();
                    }}
                    disabled={onBrowseFile === undefined}
                    className="h-10 w-10 rounded-lg hover:bg-muted"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>

                {/* Sync mode */}
                <Select
                  value={selectedSyncMode}
                  onValueChange={(value): void => {
                    setSelectedSyncMode(value as FileSyncMode);
                  }}
                >
                  <SelectTrigger className="h-10 rounded-lg border-border/50 bg-muted/30 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SYNC_MODES.map((sm) => (
                      <SelectItem key={sm.mode} value={sm.mode}>
                        {sm.label} - {sm.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Link button */}
                <Button
                  onClick={handleLinkFile}
                  disabled={fileLinkPath.trim() === '' || onLinkFile === undefined}
                  className="h-10 w-full rounded-lg shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.98] disabled:opacity-40"
                >
                  Link to File
                </Button>
              </>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Timestamps Section */}
        <Collapsible open={timestampsOpen} onOpenChange={setTimestampsOpen}>
          <CollapsibleTrigger icon={<Clock className="h-4 w-4" />}>Timestamps</CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                <span className="text-muted-foreground/70">Created</span>
                <span className="text-foreground/70">{formatDate(card.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                <span className="text-muted-foreground/70">Updated</span>
                <span className="text-foreground/70">{formatDate(card.updatedAt)}</span>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Spacer to push delete button to bottom */}
        <div className="flex-1" />

        {/* Delete Button - Muted by default, red on hover */}
        <div className="px-6 py-6">
          <button
            onClick={handleDelete}
            className={cn(
              'w-full flex items-center justify-center gap-2 rounded-lg py-3',
              'text-sm font-medium',
              'bg-muted/30 text-muted-foreground',
              'transition-all duration-200 ease-out',
              'hover:bg-destructive/10 hover:text-destructive',
              'active:scale-[0.98]'
            )}
          >
            <Trash2 className="h-4 w-4" />
            Delete Card
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * VaultNoteList - Renders vault and project docs in the primary sidebar.
 * Replaces ConversationList when vault mode is active.
 *
 * Visual style mirrors ConversationList:
 * - Section headers look like WorktreeItem group rows (folder→chevron on hover)
 * - Note items look like ConversationItem rows (text-only, vertical timeline line)
 */
import { ChevronDown, FolderOpen, FolderUp, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';

import type { UnifiedDoc } from '@/features/vault/types';
import type { FC, ReactElement, ReactNode } from 'react';

import {
  useProjectDocs,
  useVaultDocs,
  useVaultEditorStore,
  useVaultStore,
} from '@/features/vault/stores';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui/ui-store';

/** Indentation for note items nested under section header (px) — matches ConversationList */
const NOTE_INDENT_PX = 19;

/** Gradient mask for text fade (matches WorktreeItem) */
const TITLE_MASK = 'linear-gradient(to right, black 80%, transparent 95%)';

// ─── Note item row (matches ConversationItem) ────────────────────

function NoteItem({
  doc,
  isActive,
  isVault,
  onOpen,
  onDelete,
}: {
  readonly doc: UnifiedDoc;
  readonly isActive: boolean;
  readonly isVault: boolean;
  readonly onOpen: (doc: UnifiedDoc) => void;
  readonly onDelete: (doc: UnifiedDoc) => void;
}): ReactElement {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="relative group mx-1.5 ml-2"
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
    >
      <button
        type="button"
        className={cn(
          'flex items-center h-7 w-full rounded-[9px] pl-[7px] overflow-hidden',
          isHovered ? 'pr-7' : 'pr-2',
          isActive
            ? 'bg-foreground/10 text-foreground hover:bg-foreground/15'
            : 'text-lg-text-secondary hover:text-foreground hover:bg-lg-sidebar-hover'
        )}
        onClick={() => {
          onOpen(doc);
        }}
        title={doc.relativePath}
      >
        {doc.isDir ? (
          <>
            <FolderOpen className="h-3.5 w-3.5 shrink-0 mr-1.5 opacity-60" />
            <span className="text-base overflow-hidden flex-1 text-left truncate">{doc.name}</span>
          </>
        ) : (
          <span className="text-base overflow-hidden flex-1 text-left truncate">{doc.name}</span>
        )}
      </button>
      {/* Delete button on hover — vault docs only */}
      {isVault ? (
        <div className="absolute right-0.5 top-1/2 -translate-y-1/2">
          <button
            type="button"
            className={cn(
              'h-6 w-6 flex items-center justify-center rounded-md',
              'hover:bg-destructive/10 hover:text-destructive',
              isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(doc);
            }}
            title={`Delete ${doc.name}`}
            aria-label={`Delete ${doc.name}`}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ─── Collapsible section (matches WorktreeItem + ConversationList) ─

function NoteSection({
  title,
  expanded,
  onToggle,
  actions,
  items,
  emptyMessage,
  activeDocId,
  isVault,
  onOpen,
  onDelete,
}: {
  readonly title: string;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly actions?: ReactNode;
  readonly items: UnifiedDoc[];
  readonly emptyMessage: string;
  readonly activeDocId: string | null;
  readonly isVault: boolean;
  readonly onOpen: (doc: UnifiedDoc) => void;
  readonly onDelete: (doc: UnifiedDoc) => void;
}): ReactElement {
  return (
    <div>
      {/* Section header — WorktreeItem-style row */}
      <div className="relative mx-1.5">
        <div
          role="group"
          tabIndex={0}
          className="group flex items-center gap-1.5 h-8 w-full rounded-[9px] overflow-hidden hover:bg-lg-sidebar-hover cursor-default text-foreground select-none"
          onClick={onToggle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggle();
            }
          }}
        >
          {/* Toggle icon — folder by default, chevron on hover */}
          <button
            type="button"
            aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
            className="relative flex items-center justify-center shrink-0 h-5 w-5 group-hover:hover:bg-lg-control-hover rounded-full ml-0.5"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            <FolderOpen className="h-4 w-4 shrink-0 opacity-60 group-hover:hidden" />
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 transition-transform duration-150 hidden group-hover:block',
                !expanded && '-rotate-90'
              )}
            />
          </button>

          {/* Section name */}
          <span
            className="text-base whitespace-nowrap overflow-hidden text-left flex-1 w-auto"
            style={{
              maskImage: TITLE_MASK,
              WebkitMaskImage: TITLE_MASK,
            }}
          >
            {title}
          </span>

          {/* Action buttons — right side */}
          {actions !== undefined && actions !== null ? (
            <div
              className="mr-1 shrink-0 flex items-center gap-0.5"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              {actions}
            </div>
          ) : null}
        </div>
      </div>

      {/* Items with vertical timeline line — matches ConversationList renderConversations */}
      {expanded ? (
        <div className="overflow-hidden" style={{ opacity: 1 }}>
          <div className="relative mt-1" style={{ marginLeft: NOTE_INDENT_PX }}>
            {/* Vertical timeline line */}
            {items.length > 0 ? (
              <div
                className="absolute top-0 bottom-2 w-[2px] rounded-full bg-border/60"
                style={{
                  left: -2,
                  maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                  WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                }}
              />
            ) : null}
            {/* Items */}
            <div className="flex flex-col gap-0.5">
              {items.length === 0 ? (
                <p className="px-4 py-1.5 text-xs text-muted-foreground">{emptyMessage}</p>
              ) : null}
              {items.map((doc) => (
                <NoteItem
                  key={doc.id}
                  doc={doc}
                  isActive={activeDocId === doc.id}
                  isVault={isVault}
                  onOpen={onOpen}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────

interface VaultNoteListProps {
  readonly onRequestCreate: () => void;
  readonly onRequestDelete: (doc: UnifiedDoc) => void;
}

export const VaultNoteList: FC<VaultNoteListProps> = ({ onRequestCreate, onRequestDelete }) => {
  const workspacePath = useUIStore((state) => state.workspacePath);

  const currentPath = useVaultStore((state) => state.currentPath);
  const isVaultLoading = useVaultStore((state) => state.isVaultLoading);
  const isProjectDocsLoading = useVaultStore((state) => state.isProjectDocsLoading);
  const loadVaultDirectory = useVaultStore((state) => state.loadVaultDirectory);
  const navigateUp = useVaultStore((state) => state.navigateUp);
  const loadProjectDocs = useVaultStore((state) => state.loadProjectDocs);

  const activeDoc = useVaultEditorStore((state) => state.activeDoc);
  const openDocument = useVaultEditorStore((state) => state.openDocument);

  const vaultDocs = useVaultDocs();
  const projectUnifiedDocs = useProjectDocs();

  const [vaultExpanded, setVaultExpanded] = useState(true);
  const [projectExpanded, setProjectExpanded] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const handleOpenDoc = useCallback(
    (doc: UnifiedDoc): void => {
      if (!workspacePath) return;
      if (doc.isDir && doc.source === 'vault') {
        void loadVaultDirectory(workspacePath, doc.relativePath);
        return;
      }
      void openDocument(workspacePath, doc);
    },
    [workspacePath, loadVaultDirectory, openDocument]
  );

  const handleNavigateUp = useCallback((): void => {
    if (!workspacePath) return;
    void navigateUp(workspacePath);
  }, [workspacePath, navigateUp]);

  const handleRefreshProjectDocs = useCallback((): void => {
    if (!workspacePath) return;
    setRefreshing(true);
    void loadProjectDocs(workspacePath).finally(() => {
      setRefreshing(false);
    });
  }, [workspacePath, loadProjectDocs]);

  const activeDocId = activeDoc?.id ?? null;
  const canNavigateUp = currentPath.length > 0 && !isVaultLoading;

  const vaultSectionTitle = currentPath.length > 0 ? `Vault / ${currentPath}` : 'Vault Notes';

  return (
    <div className="py-1.5 flex flex-col gap-0.5">
      {/* Vault Notes section */}
      <NoteSection
        title={vaultSectionTitle}
        expanded={vaultExpanded}
        onToggle={() => {
          setVaultExpanded((prev) => !prev);
        }}
        activeDocId={activeDocId}
        isVault
        items={vaultDocs}
        emptyMessage={isVaultLoading ? 'Loading...' : 'No docs in this folder.'}
        onOpen={handleOpenDoc}
        onDelete={onRequestDelete}
        actions={
          <>
            {canNavigateUp ? (
              <button
                type="button"
                className="h-5 w-5 flex items-center justify-center rounded-md hover:bg-lg-control-hover text-muted-foreground hover:text-foreground"
                onClick={handleNavigateUp}
                title="Navigate up"
                aria-label="Navigate up"
              >
                <FolderUp className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <button
              type="button"
              className="h-5 w-5 flex items-center justify-center rounded-md hover:bg-lg-control-hover text-muted-foreground hover:text-foreground"
              onClick={onRequestCreate}
              title="Create new document or folder"
              aria-label="Create new document or folder"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </>
        }
      />

      {/* Project Notes section */}
      <NoteSection
        title="Project Docs"
        expanded={projectExpanded}
        onToggle={() => {
          setProjectExpanded((prev) => !prev);
        }}
        activeDocId={activeDocId}
        isVault={false}
        items={projectUnifiedDocs}
        emptyMessage={isProjectDocsLoading ? 'Loading...' : 'No markdown docs discovered.'}
        onOpen={handleOpenDoc}
        onDelete={onRequestDelete}
        actions={
          <button
            type="button"
            className="h-5 w-5 flex items-center justify-center rounded-md hover:bg-lg-control-hover text-muted-foreground hover:text-foreground"
            onClick={handleRefreshProjectDocs}
            disabled={isProjectDocsLoading}
            title="Refresh project docs"
            aria-label="Refresh project docs"
          >
            <RefreshCw
              className={cn(
                'h-3.5 w-3.5',
                refreshing || isProjectDocsLoading ? 'animate-spin' : ''
              )}
            />
          </button>
        }
      />
    </div>
  );
};

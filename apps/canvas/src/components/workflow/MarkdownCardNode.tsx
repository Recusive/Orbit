import { IconAgent } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconAgent';
import { IconBrainSideview } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconBrainSideview';
import { IconCodeBrackets } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconCodeBrackets';
import { IconInputForm } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconInputForm';
import { IconListSparkle } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconListSparkle';
import { IconMarkdown } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconMarkdown';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import React, { memo, useCallback, useState, useMemo, useRef, useEffect } from 'react';

import { ContextMenu } from '../ContextMenu';

import './MarkdownCardNode.css';

import type { MarkdownCardNodeData, CardType } from '../../types/workflowTypes';
import type { ContextMenuState, ContextMenuItem } from '../ContextMenu';
import type { NodeProps, Node } from '@xyflow/react';

// ============================================================================
// Icons for Card Types (using central-icons)
// ============================================================================

const PromptIcon = (): React.JSX.Element => <IconInputForm size={14} />;
const ResponseIcon = (): React.JSX.Element => <IconListSparkle size={14} />;
const DecisionIcon = (): React.JSX.Element => <IconBrainSideview size={14} />;
const DiagramIcon = (): React.JSX.Element => <IconAgent size={14} />;
const CodeSnippetIcon = (): React.JSX.Element => <IconCodeBrackets size={14} />;
const DocumentIcon = (): React.JSX.Element => <IconMarkdown size={14} />;

const ChevronRightIcon = (): React.JSX.Element => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
);

const LockIcon = (): React.JSX.Element => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
  </svg>
);

// Context Menu Icons (16px for context menu, 12px via CSS for toolbar)
const EditIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
  </svg>
);

const DuplicateIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

const ChangeTypeIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="4 7 4 4 20 4 20 7"></polyline>
    <line x1="9" y1="20" x2="15" y2="20"></line>
    <line x1="12" y1="4" x2="12" y2="20"></line>
  </svg>
);

const LockOpenIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
    <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
  </svg>
);

const LockClosedIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
  </svg>
);

const AiIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 2a10 10 0 1 0 10 10H12V2z"></path>
    <path d="M12 2a10 10 0 0 1 10 10"></path>
    <circle cx="12" cy="12" r="4"></circle>
  </svg>
);

const TrashIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
);

// File Link Icons
const FileLinkedIcon = (): React.JSX.Element => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <line x1="16" y1="13" x2="8" y2="13"></line>
    <line x1="16" y1="17" x2="8" y2="17"></line>
  </svg>
);

const FileConflictIcon = (): React.JSX.Element => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
    <line x1="12" y1="9" x2="12" y2="13"></line>
    <line x1="12" y1="17" x2="12.01" y2="17"></line>
  </svg>
);

// ============================================================================
// Card Type Icon Mapping
// ============================================================================

const CARD_TYPE_ICONS: Record<CardType, () => React.JSX.Element> = {
  prompt: PromptIcon,
  response: ResponseIcon,
  decision: DecisionIcon,
  diagram: DiagramIcon,
  'code-snippet': CodeSnippetIcon,
  document: DocumentIcon,
};

// ============================================================================
// MarkdownCardNode Component
// ============================================================================

// Estimated context menu dimensions for positioning calculations
const CONTEXT_MENU_WIDTH = 200;
const CONTEXT_MENU_HEIGHT = 320; // Approximate height based on menu items
const MENU_MARGIN = 8; // Margin from viewport edges

function MarkdownCardNodeComponent({
  data,
  selected,
}: NodeProps<Node<MarkdownCardNodeData>>): React.JSX.Element {
  const nodeData = data;
  const { card, onUpdate, onDelete, onDuplicate, onToggleCollapse, onExpand, onAssignAgent } =
    nodeData;
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [editingContent, setEditingContent] = useState(card.content);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
  });
  const cardRef = useRef<HTMLDivElement>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync editingContent when card.content changes externally
  useEffect(() => {
    if (!isEditingContent) {
      setEditingContent(card.content);
    }
  }, [card.content, isEditingContent]);

  const cardType = card.type;
  const TypeIcon = CARD_TYPE_ICONS[cardType];

  // Handle collapse toggle
  const handleToggleCollapse = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      onToggleCollapse?.(card.id);
    },
    [card.id, onToggleCollapse]
  );

  // Handle card double-click to expand (single click is for selection)
  const handleCardDoubleClick = useCallback(
    (e: React.MouseEvent): void => {
      // Don't expand if clicking on header buttons or during drag
      const target = e.target as HTMLElement;
      if (target.closest('button') !== null || target.closest('input') !== null) {
        return;
      }
      e.stopPropagation();
      onExpand?.(card.id);
    },
    [card.id, onExpand]
  );

  // Handle context menu - position directly below or above the card
  const handleContextMenu = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();

      if (!cardRef.current) {
        // Fallback to mouse position if ref not available
        setContextMenu({
          isOpen: true,
          position: { x: e.clientX, y: e.clientY },
          nodeId: card.id,
        });
        return;
      }

      const cardRect = cardRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Calculate horizontal position - align with card's left edge, adjust if needed
      let x = cardRect.left;
      // If menu would overflow right edge, shift left
      if (x + CONTEXT_MENU_WIDTH > viewportWidth - MENU_MARGIN) {
        x = viewportWidth - CONTEXT_MENU_WIDTH - MENU_MARGIN;
      }
      // Ensure not off left edge
      x = Math.max(MENU_MARGIN, x);

      // Calculate vertical position - prefer below card, or above if not enough space
      const spaceBelow = viewportHeight - cardRect.bottom;
      const spaceAbove = cardRect.top;

      let y: number;
      if (spaceBelow >= CONTEXT_MENU_HEIGHT + MENU_MARGIN) {
        // Enough space below - position directly under the card
        y = cardRect.bottom + MENU_MARGIN;
      } else if (spaceAbove >= CONTEXT_MENU_HEIGHT + MENU_MARGIN) {
        // Not enough below, but enough above - position above the card
        y = cardRect.top - CONTEXT_MENU_HEIGHT - MENU_MARGIN;
      } else {
        // Not enough space either way - position at bottom of viewport
        y = Math.max(MENU_MARGIN, viewportHeight - CONTEXT_MENU_HEIGHT - MENU_MARGIN);
      }

      setContextMenu({
        isOpen: true,
        position: { x, y },
        nodeId: card.id,
      });
    },
    [card.id]
  );

  // Close context menu
  const handleCloseContextMenu = useCallback((): void => {
    setContextMenu({ isOpen: false, position: { x: 0, y: 0 } });
  }, []);

  // Context menu items
  const contextMenuItems = useMemo((): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      {
        label: 'Edit',
        icon: <EditIcon />,
        action: () => {
          onExpand?.(card.id);
        },
      },
      {
        label: 'Duplicate',
        icon: <DuplicateIcon />,
        action: () => {
          onDuplicate?.(card.id);
        },
      },
      {
        label: '',
        action: (): void => {
          /* divider - no action */
        },
        divider: true,
      },
      {
        label: 'Change Type',
        icon: <ChangeTypeIcon />,
        action: (): void => {
          /* TODO: implement type change submenu */
        },
        disabled: true,
      },
      {
        label: card.locked ? 'Unlock' : 'Lock',
        icon: card.locked ? <LockOpenIcon /> : <LockClosedIcon />,
        action: () => {
          onUpdate?.(card.id, { locked: !card.locked });
        },
      },
      {
        label: '',
        action: (): void => {
          /* divider - no action */
        },
        divider: true,
      },
      {
        label: 'Assign to AI',
        icon: <AiIcon />,
        action: () => {
          onAssignAgent?.(card.id, 'claude');
        },
      },
      {
        label: '',
        action: (): void => {
          /* divider - no action */
        },
        divider: true,
      },
      {
        label: 'Delete',
        icon: <TrashIcon />,
        action: () => {
          onDelete?.(card.id);
        },
      },
    ];
    return items;
  }, [card.id, card.locked, onExpand, onDuplicate, onUpdate, onAssignAgent, onDelete]);

  // Handle title edit
  const handleTitleDoubleClick = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      if (!card.locked) {
        setIsEditing(true);
      }
    },
    [card.locked]
  );

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      onUpdate?.(card.id, { name: e.target.value });
    },
    [card.id, onUpdate]
  );

  const handleTitleBlur = useCallback((): void => {
    setIsEditing(false);
  }, []);

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      setIsEditing(false);
    }
  }, []);

  // Handle content change
  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setEditingContent(e.target.value);
  }, []);

  // Handle content save
  const handleContentSave = useCallback((): void => {
    if (editingContent !== card.content) {
      onUpdate?.(card.id, { content: editingContent });
    }
    setIsEditingContent(false);
  }, [card.id, card.content, editingContent, onUpdate]);

  // Handle content cancel
  const handleContentCancel = useCallback((): void => {
    setEditingContent(card.content);
    setIsEditingContent(false);
  }, [card.content]);

  // Handle content keydown
  const handleContentKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleContentCancel();
      } else if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleContentSave();
      }
    },
    [handleContentCancel, handleContentSave]
  );

  // Calculate if resizer should be visible
  const isResizerVisible: boolean = selected && !card.locked;

  return (
    <>
      {/* Resize handles when selected */}
      <NodeResizer
        minWidth={280}
        maxWidth={480}
        minHeight={100}
        isVisible={isResizerVisible}
        lineClassName="nodrag"
        handleClassName="nodrag"
      />

      {/* Card container with data attributes for styling */}
      <div
        ref={cardRef}
        className="markdown-card-node"
        data-selected={selected}
        data-type={cardType}
        data-collapsed={card.collapsed}
        onDoubleClick={handleCardDoubleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Floating Action Toolbar - appears above selected nodes */}
        <div className="card-action-toolbar nodrag">
          <button
            className="card-action-toolbar__button"
            onClick={(e) => {
              e.stopPropagation();
              onExpand?.(card.id);
            }}
            title="Edit card"
          >
            <span className="card-action-toolbar__icon">
              <EditIcon />
            </span>
            <span>Edit</span>
          </button>
          <button
            className="card-action-toolbar__button card-action-toolbar__button--ai"
            onClick={(e) => {
              e.stopPropagation();
              onAssignAgent?.(card.id, 'claude');
            }}
            title="Ask AI about this card"
          >
            <span className="card-action-toolbar__icon">
              <AiIcon />
            </span>
            <span>Ask AI</span>
          </button>
          <div className="card-action-toolbar__divider" />
          <button
            className="card-action-toolbar__button card-action-toolbar__button--delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(card.id);
            }}
            title="Delete card"
          >
            <span className="card-action-toolbar__icon">
              <TrashIcon />
            </span>
            <span>Delete</span>
          </button>
        </div>
        {/* Connection handles - left (target/input) and right (source/output) */}
        <Handle
          type="target"
          position={Position.Left}
          id="left"
          data-handleid="left"
          data-nodeid={card.id}
          data-handlepos="left"
        />
        <Handle
          type="source"
          position={Position.Right}
          id="right"
          data-handleid="right"
          data-nodeid={card.id}
          data-handlepos="right"
        />

        {/* Locked indicator */}
        {card.locked ? (
          <div className="markdown-card-node__locked">
            <LockIcon />
          </div>
        ) : null}

        {/* Header - compact single row: icon + title + chevron */}
        <div className="markdown-card-node__header">
          {/* Icon with colored background */}
          <div className="markdown-card-node__icon">
            <TypeIcon />
          </div>

          {/* Title area */}
          <div className="markdown-card-node__title-area">
            {isEditing ? (
              <input
                className="markdown-card-node__title-input"
                value={card.name}
                onChange={handleTitleChange}
                onBlur={handleTitleBlur}
                onKeyDown={handleTitleKeyDown}
                onClick={(e) => {
                  e.stopPropagation();
                }}
                autoFocus
              />
            ) : (
              <span className="markdown-card-node__title" onDoubleClick={handleTitleDoubleClick}>
                {card.name}
              </span>
            )}
          </div>

          {/* File link indicator */}
          {card.filePath !== undefined && (
            <div
              className="markdown-card-node__file-link"
              data-conflict={card.fileConflict !== undefined}
              title={
                card.fileConflict !== undefined
                  ? `Conflict: ${card.filePath}`
                  : `Linked: ${card.filePath}`
              }
            >
              {card.fileConflict !== undefined ? <FileConflictIcon /> : <FileLinkedIcon />}
            </div>
          )}

          {/* Chevron toggle */}
          <div className="markdown-card-node__actions">
            <button
              className="markdown-card-node__action-btn nodrag"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleToggleCollapse(e);
              }}
              onDoubleClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              title={card.collapsed ? 'Expand' : 'Collapse'}
              data-collapsed={card.collapsed}
            >
              <ChevronRightIcon />
            </button>
          </div>
        </div>

        {/* Content - CSS Grid for collapse */}
        <div className="markdown-card-node__content-wrapper" data-collapsed={card.collapsed}>
          {isEditingContent && !card.collapsed ? (
            <div className="markdown-card-node__content" style={{ position: 'relative' }}>
              <textarea
                ref={contentTextareaRef}
                className="markdown-card-node__textarea nodrag nowheel"
                value={editingContent}
                onChange={handleContentChange}
                onBlur={handleContentSave}
                onKeyDown={handleContentKeyDown}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              />
              <span className="markdown-card-node__edit-hint">Esc to cancel · ⌘S to save</span>
            </div>
          ) : (
            <div className="markdown-card-node__content">
              {/* Full content preview */}
              <div className="markdown-card-node__full-content">{card.content}</div>
            </div>
          )}
        </div>

        {/* Tags - CSS Grid for collapse */}
        {card.tags.length > 0 ? (
          <div className="markdown-card-node__tags-wrapper" data-collapsed={card.collapsed}>
            <div className="markdown-card-node__tags">
              {card.tags.map((tag: string, index: number) => (
                <span key={index} className="markdown-card-node__tag">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Context Menu */}
      <ContextMenu
        menuState={contextMenu}
        items={contextMenuItems}
        onClose={handleCloseContextMenu}
      />
    </>
  );
}

// Memoize to prevent unnecessary re-renders
export const MarkdownCardNode = memo(MarkdownCardNodeComponent);

import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  SquareCode,
  Strikethrough,
} from 'lucide-react';

import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ToolbarAction {
  readonly key: string;
  readonly label: string;
  readonly shortcut?: string;
  readonly icon: FC<{ readonly className?: string }>;
  readonly command: string;
  readonly payload?: unknown;
}

const HEADING_ACTIONS: readonly ToolbarAction[] = [
  { key: 'h1', label: 'Heading 1', icon: Heading1, command: 'WrapInHeading', payload: 1 },
  { key: 'h2', label: 'Heading 2', icon: Heading2, command: 'WrapInHeading', payload: 2 },
  { key: 'h3', label: 'Heading 3', icon: Heading3, command: 'WrapInHeading', payload: 3 },
];

const INLINE_ACTIONS: readonly ToolbarAction[] = [
  { key: 'bold', label: 'Bold', shortcut: '⌘B', icon: Bold, command: 'ToggleStrong' },
  { key: 'italic', label: 'Italic', shortcut: '⌘I', icon: Italic, command: 'ToggleEmphasis' },
  {
    key: 'strikethrough',
    label: 'Strikethrough',
    shortcut: '⌘⇧S',
    icon: Strikethrough,
    command: 'ToggleStrikeThrough',
  },
  { key: 'code', label: 'Inline Code', shortcut: '⌘E', icon: Code, command: 'ToggleInlineCode' },
  { key: 'link', label: 'Link', shortcut: '⌘K', icon: Link, command: 'ToggleLink' },
];

const BLOCK_ACTIONS: readonly ToolbarAction[] = [
  { key: 'bullet', label: 'Bullet List', icon: List, command: 'WrapInBulletList' },
  { key: 'ordered', label: 'Ordered List', icon: ListOrdered, command: 'WrapInOrderedList' },
  { key: 'tasklist', label: 'Task List', icon: ListChecks, command: '__InsertTaskList' },
  { key: 'blockquote', label: 'Blockquote', icon: Quote, command: 'WrapInBlockquote' },
  {
    key: 'codeblock',
    label: 'Code Block',
    shortcut: '⌘⌥C',
    icon: SquareCode,
    command: 'CreateCodeBlock',
  },
  { key: 'hr', label: 'Horizontal Rule', icon: Minus, command: 'InsertHr' },
];

interface VaultFormatToolbarProps {
  readonly onCommand: (command: string, payload?: unknown) => void;
}

function ToolbarGroup({
  actions,
  onCommand,
}: {
  readonly actions: readonly ToolbarAction[];
  readonly onCommand: (cmd: string, payload?: unknown) => void;
}): React.JSX.Element {
  return (
    <>
      {actions.map((action) => (
        <Tooltip key={action.key}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onMouseDown={(e) => {
                e.preventDefault();
                onCommand(action.command, action.payload);
              }}
            >
              <action.icon className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {action.label}
            {action.shortcut ? (
              <kbd className="ml-1.5 text-muted-foreground">{action.shortcut}</kbd>
            ) : null}
          </TooltipContent>
        </Tooltip>
      ))}
    </>
  );
}

function Divider(): React.JSX.Element {
  return <div className="h-4 w-px bg-lg-separator mx-0.5" />;
}

export const VaultFormatToolbar: FC<VaultFormatToolbarProps> = ({ onCommand }) => {
  return (
    <TooltipProvider delayDuration={400}>
      <div className="h-9 border-b border-lg-separator px-3 flex items-center gap-0.5">
        <ToolbarGroup actions={HEADING_ACTIONS} onCommand={onCommand} />
        <Divider />
        <ToolbarGroup actions={INLINE_ACTIONS} onCommand={onCommand} />
        <Divider />
        <ToolbarGroup actions={BLOCK_ACTIONS} onCommand={onCommand} />
      </div>
    </TooltipProvider>
  );
};

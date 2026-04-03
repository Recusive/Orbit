import type { PermissionRequest } from '@/stores/agent/tool-store';
import type { ContextItem, FileEntry } from '@/types/agent/context';
import type {
  EffortLevel,
  InputMode,
  Model,
  ReactElementContext,
  ThinkingMode,
} from '@/types/protocol';
import type { LexicalEditor } from 'lexical';

export interface UsageData {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadInputTokens?: number;
  readonly cacheCreationInputTokens?: number;
}

export interface ImageAttachment {
  name: string;
  mimeType: string;
  data?: string | undefined;
  previewUrl: string;
}

export interface ChatInputProps {
  readonly inputMode: InputMode;
  readonly thinkingMode: ThinkingMode;
  readonly effortLevel: EffortLevel;
  readonly isAgentRunning: boolean;
  /** Permission requests to render inside the input container */
  readonly permissions?: readonly PermissionRequest[];
  readonly onPermissionApprove?: (
    requestId: string,
    always?: boolean,
    answers?: Record<string, string>
  ) => void;
  readonly onPermissionDeny?: (requestId: string) => void;
  readonly onSend: (
    text: string,
    contextFiles?: string[],
    images?: ImageAttachment[],
    elements?: ReactElementContext[],
    skills?: string[]
  ) => void;
  readonly onStop: () => void;
  readonly onModeChange: (mode: InputMode) => void;
  readonly onThinkingModeChange: (mode: ThinkingMode) => void;
  readonly onEffortChange: (level: EffortLevel) => void;
  readonly onModelChange: (model: Model) => void;
}

export interface ThinkingModeInfo {
  readonly level: string;
  readonly tokens: string;
}

export interface EffortLevelInfo {
  readonly level: string;
  readonly description: string;
}

export interface PopoverNavigationState {
  // Mention popover
  mentionOpen: boolean;
  setMentionOpen: (open: boolean) => void;
  mentionQuery: string;
  setMentionQuery: (query: string) => void;
  mentionSelectedIndex: number;
  setMentionSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  mentionStartIndex: number;
  setMentionStartIndex: (index: number) => void;
  // Slash popover
  slashOpen: boolean;
  setSlashOpen: (open: boolean) => void;
  slashQuery: string;
  setSlashQuery: (query: string) => void;
  slashSelectedIndex: number;
  setSlashSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  /** Character index in inputText where the current "/" token starts */
  slashStartIndex: number;
  setSlashStartIndex: (index: number) => void;
  // Thinking hover
  thinkingHoverOpen: boolean;
  setThinkingHoverOpen: (open: boolean) => void;
  // Effort hover
  effortHoverOpen: boolean;
  setEffortHoverOpen: (open: boolean) => void;
  // Actions
  closeMentionPopover: () => void;
  closeSlashPopover: () => void;
}

export interface UseChatInputOptions {
  readonly inputMode: InputMode;
  readonly thinkingMode: ThinkingMode;
  readonly effortLevel: EffortLevel;
  readonly isAgentRunning: boolean;
  readonly onSend: ChatInputProps['onSend'];
  readonly onStop: () => void;
  readonly onModeChange: (mode: InputMode) => void;
  readonly onThinkingModeChange: (mode: ThinkingMode) => void;
  readonly onEffortChange: (level: EffortLevel) => void;
}

export interface UseChatInputReturn {
  // State
  inputText: string;
  attachedContext: ContextItem[];
  slashCommands: SlashCommand[];
  isInputEmpty: boolean;
  /** Untyped suffix of the top matching slash command (e.g., "mit" when typing "/com" → "commit") */
  slashGhostText: string;
  /** Name of a known leading slash command (e.g., "compact") for visual highlighting, or null */
  leadingCommand: string | null;
  // Refs
  editorElementRef: React.RefObject<HTMLDivElement | null>;
  editorRef: React.RefObject<LexicalEditor | null>;
  imageInputRef: React.RefObject<HTMLInputElement | null>;
  // Popover state
  popover: PopoverNavigationState;
  // Handlers
  handleShiftTab: () => void;
  handleTextChange: (text: string) => void;
  handleSend: () => void;
  handleImageClick: () => void;
  handleImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleMentionSelect: (file: FileEntry) => void;
  handleSlashSelect: (command: SlashCommand) => void;
  handleRemoveContext: (id: string) => void;
  handleStop: () => void;
  cycleInputMode: () => void;
  cycleThinkingMode: () => void;
  cycleEffortLevel: () => void;
  // Utilities
  getThinkingInfo: () => ThinkingModeInfo;
  getActiveDots: () => number;
  getEffortInfo: () => EffortLevelInfo;
  getInputBoxClasses: () => string;
  // Browser context
  elementContexts: ReactElementContext[];
  removeElementContext: (index: number) => void;
}

export interface SlashCommand {
  name: string;
  description: string;
  /** Distinguishes skills from regular slash commands in the popover */
  kind?: 'command' | 'skill';
}

export interface InputControlsProps {
  readonly inputMode: InputMode;
  readonly model: Model;
  readonly thinkingMode: ThinkingMode;
  readonly effortLevel: EffortLevel;
  readonly isAgentRunning: boolean;
  readonly isInputEmpty: boolean;
  readonly usage: UsageData;
  readonly maxTokens: number;
  readonly imageInputRef: React.RefObject<HTMLInputElement | null>;
  readonly thinkingHoverOpen: boolean;
  readonly setThinkingHoverOpen: (open: boolean) => void;
  readonly onModelChange: (model: Model) => void;
  readonly onEffortChange: (level: EffortLevel) => void;
  readonly cycleInputMode: () => void;
  readonly cycleThinkingMode: () => void;
  readonly cycleEffortLevel: () => void;
  readonly handleImageClick: () => void;
  readonly handleImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  readonly handleSend: () => void;
  readonly handleStop: () => void;
  readonly getThinkingInfo: () => ThinkingModeInfo;
  readonly getActiveDots: () => number;
  readonly getEffortInfo: () => EffortLevelInfo;
}

export interface ThinkingModeButtonProps {
  readonly thinkingMode: ThinkingMode;
  readonly thinkingHoverOpen: boolean;
  readonly setThinkingHoverOpen: (open: boolean) => void;
  readonly cycleThinkingMode: () => void;
  readonly getThinkingInfo: () => ThinkingModeInfo;
  readonly getActiveDots: () => number;
}

export interface EffortLevelButtonProps {
  readonly effortLevel: EffortLevel;
  readonly effortHoverOpen: boolean;
  readonly setEffortHoverOpen: (open: boolean) => void;
  readonly cycleEffortLevel: () => void;
  readonly getEffortInfo: () => EffortLevelInfo;
}

export interface MoreActionsMenuProps {
  readonly model: Model;
  readonly cycleThinkingMode: () => void;
  readonly thinkingMode: ThinkingMode;
  readonly getThinkingInfo: () => ThinkingModeInfo;
  readonly cycleEffortLevel: () => void;
  readonly effortLevel: EffortLevel;
  readonly getEffortInfo: () => EffortLevelInfo;
}

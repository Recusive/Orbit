import type { ContextItem, FileEntry } from '@/types/agent/context';
import type { InputMode, Model, ReactElementContext, ThinkingMode } from '@/types/protocol';

export interface UsageData {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface ImageAttachment {
  name: string;
  mimeType: string;
  data: string; // Base64 encoded
  previewUrl: string; // Data URL for display
}

export interface ChatInputProps {
  readonly inputMode: InputMode;
  readonly thinkingMode: ThinkingMode;
  readonly isAgentRunning: boolean;
  readonly usage: UsageData;
  readonly maxTokens: number;
  readonly hasPermissionPending?: boolean;
  readonly onSend: (
    text: string,
    contextFiles?: string[],
    images?: ImageAttachment[],
    elements?: ReactElementContext[]
  ) => void;
  readonly onStop: () => void;
  readonly onModeChange: (mode: InputMode) => void;
  readonly onThinkingModeChange: (mode: ThinkingMode) => void;
  readonly onModelChange: (model: Model) => void;
}

export interface ThinkingModeInfo {
  readonly level: string;
  readonly tokens: string;
}

export interface PopoverNavigationState {
  // Mention popover
  mentionOpen: boolean;
  setMentionOpen: (open: boolean) => void;
  mentionQuery: string;
  setMentionQuery: (query: string) => void;
  mentionSelectedIndex: number;
  setMentionSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  // Slash popover
  slashOpen: boolean;
  setSlashOpen: (open: boolean) => void;
  slashQuery: string;
  setSlashQuery: (query: string) => void;
  slashSelectedIndex: number;
  setSlashSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  // Thinking hover
  thinkingHoverOpen: boolean;
  setThinkingHoverOpen: (open: boolean) => void;
  // Actions
  closeMentionPopover: () => void;
  closeSlashPopover: () => void;
}

export interface UseChatInputOptions {
  readonly inputMode: InputMode;
  readonly thinkingMode: ThinkingMode;
  readonly isAgentRunning: boolean;
  readonly onSend: ChatInputProps['onSend'];
  readonly onStop: () => void;
  readonly onModeChange: (mode: InputMode) => void;
  readonly onThinkingModeChange: (mode: ThinkingMode) => void;
}

export interface UseChatInputReturn {
  // State
  inputText: string;
  attachedContext: ContextItem[];
  slashCommands: SlashCommand[];
  isInputEmpty: boolean;
  // Refs
  inputRef: React.RefObject<HTMLDivElement | null>;
  imageInputRef: React.RefObject<HTMLInputElement | null>;
  // Popover state
  popover: PopoverNavigationState;
  // Handlers
  handleInputChange: (e: React.FormEvent<HTMLDivElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handlePaste: (e: React.ClipboardEvent) => void;
  handleSend: () => void;
  handleImageClick: () => void;
  handleImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleMentionSelect: (file: FileEntry) => void;
  handleSlashSelect: (command: SlashCommand) => void;
  handleRemoveContext: (id: string) => void;
  handleAtClick: () => void;
  cycleInputMode: () => void;
  cycleThinkingMode: () => void;
  // Utilities
  getThinkingInfo: () => ThinkingModeInfo;
  getActiveDots: () => number;
  getInputBoxClasses: (hasPermissionPending: boolean) => string;
  // Browser context
  elementContexts: ReactElementContext[];
  removeElementContext: (index: number) => void;
}

export interface SlashCommand {
  name: string;
  description: string;
}

export interface InputControlsProps {
  readonly inputMode: InputMode;
  readonly thinkingMode: ThinkingMode;
  readonly isAgentRunning: boolean;
  readonly isInputEmpty: boolean;
  readonly usage: UsageData;
  readonly maxTokens: number;
  readonly imageInputRef: React.RefObject<HTMLInputElement | null>;
  readonly thinkingHoverOpen: boolean;
  readonly setThinkingHoverOpen: (open: boolean) => void;
  readonly onModelChange: (model: Model) => void;
  readonly cycleInputMode: () => void;
  readonly cycleThinkingMode: () => void;
  readonly handleAtClick: () => void;
  readonly handleGlobeClick: () => void;
  readonly handleImageClick: () => void;
  readonly handleImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  readonly handleSend: () => void;
  readonly onStop: () => void;
  readonly getThinkingInfo: () => ThinkingModeInfo;
  readonly getActiveDots: () => number;
}

export interface ThinkingModeButtonProps {
  readonly thinkingMode: ThinkingMode;
  readonly thinkingHoverOpen: boolean;
  readonly setThinkingHoverOpen: (open: boolean) => void;
  readonly cycleThinkingMode: () => void;
  readonly getThinkingInfo: () => ThinkingModeInfo;
  readonly getActiveDots: () => number;
}

export interface MoreActionsMenuProps {
  readonly handleAtClick: () => void;
  readonly cycleThinkingMode: () => void;
  readonly thinkingMode: ThinkingMode;
  readonly getThinkingInfo: () => ThinkingModeInfo;
  /** Optional - enable when browser feature is implemented */
  readonly handleGlobeClick?: () => void;
}

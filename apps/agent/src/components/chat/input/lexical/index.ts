export { LexicalChatEditor } from './LexicalChatEditor';
export { SlashCommandNode, $createSlashCommandNode, $isSlashCommandNode } from './SlashCommandNode';
export {
  clearEditor,
  readActiveTrigger,
  readEditorText,
  replaceTriggerRange,
  setEditorText,
} from './bridge';
export type { TriggerRange } from './bridge';

import { SectionDivider, SectionHeader, ShortcutItem } from '../components';

import type { FC } from 'react';

export const ShortcutsSettings: FC = () => {
  return (
    <div>
      <SectionHeader title="General">Global keyboard shortcuts</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <ShortcutItem label="Command Palette" keys={['⌘', 'P']} />
        <ShortcutItem label="Settings" keys={['⌘', ',']} />
        <ShortcutItem label="New Chat" keys={['⌘', 'N']} />
        <ShortcutItem label="Close Tab" keys={['⌘', 'W']} />
      </div>

      <SectionDivider />

      <SectionHeader title="Chat">Chat-related shortcuts</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <ShortcutItem label="Send Message" keys={['⌘', '↵']} />
        <ShortcutItem label="Stop Generation" keys={['Esc']} />
        <ShortcutItem label="Add Context" keys={['@']} />
        <ShortcutItem label="Slash Commands" keys={['/']} />
        <ShortcutItem label="New Line" keys={['Shift', '↵']} />
      </div>

      <SectionDivider />

      <SectionHeader title="Editor">Editor shortcuts</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <ShortcutItem label="Save File" keys={['⌘', 'S']} />
        <ShortcutItem label="Find in File" keys={['⌘', 'F']} />
        <ShortcutItem label="Go to Line" keys={['⌘', 'G']} />
        <ShortcutItem label="Undo" keys={['⌘', 'Z']} />
        <ShortcutItem label="Redo" keys={['⌘', 'Shift', 'Z']} />
      </div>

      <SectionDivider />

      <SectionHeader title="Panels">Panel visibility shortcuts</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <ShortcutItem label="Toggle Left Sidebar" keys={['⌘', '/']} />
        <ShortcutItem label="Toggle Activity Panel" keys={['⌘', 'B']} />
        <ShortcutItem label="Toggle Editor Panel" keys={['⌘', 'E']} />
        <ShortcutItem label="Toggle Terminal" keys={['⌘', 'J']} />
        <ShortcutItem label="Find in Workspace" keys={['⌘', 'Shift', 'F']} />
      </div>
    </div>
  );
};

export default ShortcutsSettings;

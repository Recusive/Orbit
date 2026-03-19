import { SectionDivider, SectionHeader, ShortcutItem } from '../components';

import type { FC } from 'react';

import { getModifierSymbols } from '@/lib/utils';

export const ShortcutsSettings: FC = () => {
  const mod = getModifierSymbols();

  return (
    <div className="animate-settings-in">
      <SectionHeader title="General">Global keyboard shortcuts</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <ShortcutItem label="Command Palette" keys={[mod.cmd, 'K']} />
        <ShortcutItem label="Quick Open / Go to File" keys={[mod.cmd, 'P']} />
        <ShortcutItem label="Settings" keys={[mod.cmd, ',']} />
        <ShortcutItem label="New Session" keys={[mod.cmd, 'N']} />
        <ShortcutItem label="Projects" keys={[mod.cmd, 'T']} />
        <ShortcutItem label="Close Tab" keys={[mod.cmd, 'W']} />
      </div>

      <SectionDivider />

      <SectionHeader title="Chat">Chat-related shortcuts</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <ShortcutItem label="Cycle Input Mode" keys={[mod.shift, '⇥']} />
        <ShortcutItem label="Send Message" keys={[mod.cmd, '↵']} />
        <ShortcutItem label="Stop Generation" keys={['Esc']} />
        <ShortcutItem label="Add Context" keys={['@']} />
        <ShortcutItem label="Slash Commands" keys={['/']} />
        <ShortcutItem label="New Line" keys={[mod.shift, '↵']} />
      </div>

      <SectionDivider />

      <SectionHeader title="Editor">Editor shortcuts</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <ShortcutItem label="Find in File" keys={[mod.cmd, 'F']} />
        <ShortcutItem label="Go to Line" keys={[mod.cmd, 'G']} />
        <ShortcutItem label="Undo" keys={[mod.cmd, 'Z']} />
        <ShortcutItem label="Redo" keys={[mod.cmd, mod.shift, 'Z']} />
      </div>

      <SectionDivider />

      <SectionHeader title="Panels">Panel visibility shortcuts</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <ShortcutItem label="Toggle Left Sidebar" keys={[mod.cmd, 'S']} />
        <ShortcutItem label="Toggle Activity Panel" keys={[mod.cmd, 'B']} />
        <ShortcutItem label="Toggle Editor Panel" keys={[mod.cmd, 'E']} />
        <ShortcutItem label="Toggle Terminal" keys={[mod.cmd, 'J']} />
        <ShortcutItem label="Source Control" keys={[mod.ctrl, mod.shift, 'G']} />
        <ShortcutItem label="Find in Workspace" keys={[mod.cmd, mod.shift, 'F']} />
      </div>
    </div>
  );
};

export default ShortcutsSettings;

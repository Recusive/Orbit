import { FolderOpen } from 'lucide-react';
import { useState } from 'react';

import { SectionDivider, SectionHeader, SettingItem } from '../components';

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
import { Switch } from '@/components/ui/switch';

export const AgentSettings: FC = () => {
  const [allowBash, setAllowBash] = useState(true);
  const [allowMcp, setAllowMcp] = useState(true);
  const [artifact, setArtifact] = useState(false);
  const [terminalRows, setTerminalRows] = useState('30');
  const [fileAccess, setFileAccess] = useState('all');
  const [enableAuto, setEnableAuto] = useState(true);
  const [autoClose, setAutoClose] = useState(true);
  const [maxTurns, setMaxTurns] = useState('50');

  return (
    <div>
      {/* Security */}
      <SectionHeader title="Security">
        Control which tools and capabilities the agent can use
      </SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem
          label="Allow Bash Tool"
          description="Enable the agent to execute shell commands"
        >
          <Switch checked={allowBash} onCheckedChange={setAllowBash} />
        </SettingItem>

        <SettingItem
          label="Allow MCP Servers"
          description="Allow connections to Model Context Protocol servers"
        >
          <Switch checked={allowMcp} onCheckedChange={setAllowMcp} />
        </SettingItem>
      </div>

      <SectionDivider />

      {/* Artifact */}
      <SectionHeader title="Artifact">Configure artifact generation and handling</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem
          label="Enable Artifacts"
          description="Allow the agent to create visual artifacts"
        >
          <Switch checked={artifact} onCheckedChange={setArtifact} />
        </SettingItem>
      </div>

      <SectionDivider />

      {/* Terminal */}
      <SectionHeader title="Terminal">Configure terminal behavior and appearance</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Terminal Rows" description="Number of rows visible in the terminal">
          <Input
            type="number"
            value={terminalRows}
            onChange={(e) => {
              setTerminalRows(e.target.value);
            }}
            className="w-20 h-8 text-sm"
          />
        </SettingItem>
      </div>

      <SectionDivider />

      {/* File Access */}
      <SectionHeader title="File Access">
        Control which files the agent can read and modify
      </SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="File Access Level" description="Define the scope of file system access">
          <Select value={fileAccess} onValueChange={setFileAccess}>
            <SelectTrigger className="w-40 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Files</SelectItem>
              <SelectItem value="workspace">Workspace Only</SelectItem>
              <SelectItem value="none">No Access</SelectItem>
            </SelectContent>
          </Select>
        </SettingItem>
      </div>

      <SectionDivider />

      {/* Automation */}
      <SectionHeader title="Automation">Configure autonomous behavior</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Enable Auto Mode" description="Allow the agent to work autonomously">
          <Switch checked={enableAuto} onCheckedChange={setEnableAuto} />
        </SettingItem>

        <SettingItem
          label="Auto-close on Complete"
          description="Automatically close panels when task completes"
        >
          <Switch checked={autoClose} onCheckedChange={setAutoClose} />
        </SettingItem>

        <SettingItem label="Max Turns" description="Maximum number of turns in auto mode">
          <Input
            type="number"
            value={maxTurns}
            onChange={(e) => {
              setMaxTurns(e.target.value);
            }}
            className="w-20 h-8 text-sm"
          />
        </SettingItem>
      </div>

      <SectionDivider />

      {/* General */}
      <SectionHeader title="General">General agent settings</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Custom Instructions" description="Path to custom instructions file">
          <div className="flex items-center gap-2">
            <Input placeholder="CLAUDE.md" className="w-40 h-8 text-sm" />
            <Button variant="outline" size="sm" className="h-8">
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
        </SettingItem>
      </div>
    </div>
  );
};

export default AgentSettings;

import { IconPaintBucket } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconPaintBucket';
import { IconSettingsKnob } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconSettingsKnob';
import { hexagons7, tab } from '@lucide/lab';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  AppWindowMac,
  Bell,
  Bot,
  ChevronRight,
  FileText,
  FlaskConical,
  FolderOpen,
  Globe,
  Icon,
  Keyboard,
  MessageSquare,
  Settings2,
  Terminal,
  User,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { SlashCommandsSettings } from './slash-commands-settings';
import { SubagentsSettings } from './subagents-settings';

import type { FC, ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogPortal } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils/utils';

export type SettingsSection =
  | 'general'
  | 'appearance'
  | 'agent'
  | 'subagents'
  | 'commands'
  | 'shortcuts'
  | 'browser'
  | 'editor'
  | 'notifications'
  | 'tabs'
  | 'account'
  | 'feedback';

export interface SettingsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly defaultSection?: SettingsSection;
}

// Sidebar navigation item
interface NavItemProps {
  readonly icon: ReactNode;
  readonly label: string;
  readonly isActive: boolean;
  readonly onClick: () => void;
}

const NavItem: FC<NavItemProps> = ({ icon, label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex w-full items-center gap-2 px-2.5 py-2 text-[13px] transition-colors duration-150',
      isActive
        ? 'bg-primary/10 text-foreground border-l-2 border-primary/60 pl-[8px] rounded-r-lg rounded-l-none'
        : 'text-muted-foreground/70 hover:bg-muted/50 hover:text-foreground rounded-lg'
    )}
  >
    <span className={cn('shrink-0', isActive ? 'opacity-100' : 'opacity-70')}>{icon}</span>
    <span>{label}</span>
  </button>
);

// Setting item wrapper
interface SettingItemProps {
  readonly label: string;
  readonly description?: string;
  readonly children: ReactNode;
}

const SettingItem: FC<SettingItemProps> = ({ label, description, children }) => (
  <div className="flex items-center justify-between py-3.5">
    <div className="flex-1 pr-4">
      <div className="text-[13px] font-medium">{label}</div>
      {description !== undefined && (
        <div className="text-[11px] text-muted-foreground/60 mt-1">{description}</div>
      )}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

// Section header
interface SectionHeaderProps {
  readonly title: string;
  readonly children?: ReactNode;
}

const SectionHeader: FC<SectionHeaderProps> = ({ title, children }) => (
  <div className="mb-5">
    <h3 className="text-[15px] font-semibold mb-1.5">{title}</h3>
    {children !== undefined && (
      <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{children}</p>
    )}
  </div>
);

// Section divider
const SectionDivider: FC = () => <div className="h-px bg-border/30 my-7" />;

// Agent settings panel
const AgentSettings: FC = () => {
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

// Browser settings panel
const BrowserSettings: FC = () => {
  const [enableBrowser, setEnableBrowser] = useState(true);
  const [headless, setHeadless] = useState(true);

  return (
    <div>
      <SectionHeader title="Browser">Configure browser automation settings</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Enable Browser Tool" description="Allow the agent to browse websites">
          <Switch checked={enableBrowser} onCheckedChange={setEnableBrowser} />
        </SettingItem>

        <SettingItem label="Headless Mode" description="Run browser without visible window">
          <Switch checked={headless} onCheckedChange={setHeadless} />
        </SettingItem>
      </div>
    </div>
  );
};

// Editor settings panel
const EditorSettings: FC = () => {
  const [theme, setTheme] = useState('dark');
  const [fontSize, setFontSize] = useState('13');
  const [tabSize, setTabSize] = useState('2');
  const [wordWrap, setWordWrap] = useState(true);
  const [minimap, setMinimap] = useState(false);

  return (
    <div>
      <SectionHeader title="Appearance">Customize the editor appearance</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Theme" description="Choose your preferred color theme">
          <Select value={theme} onValueChange={setTheme}>
            <SelectTrigger className="w-32 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </SettingItem>

        <SettingItem label="Font Size" description="Editor font size in pixels">
          <Input
            type="number"
            value={fontSize}
            onChange={(e) => {
              setFontSize(e.target.value);
            }}
            className="w-20 h-8 text-sm"
          />
        </SettingItem>

        <SettingItem label="Tab Size" description="Number of spaces per tab">
          <Input
            type="number"
            value={tabSize}
            onChange={(e) => {
              setTabSize(e.target.value);
            }}
            className="w-20 h-8 text-sm"
          />
        </SettingItem>
      </div>

      <SectionDivider />

      <SectionHeader title="Features">Toggle editor features</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Word Wrap" description="Wrap long lines to fit the editor width">
          <Switch checked={wordWrap} onCheckedChange={setWordWrap} />
        </SettingItem>

        <SettingItem label="Minimap" description="Show code minimap on the side">
          <Switch checked={minimap} onCheckedChange={setMinimap} />
        </SettingItem>
      </div>
    </div>
  );
};

// Notifications settings panel
const NotificationsSettings: FC = () => {
  const [enableNotifications, setEnableNotifications] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showErrors, setShowErrors] = useState(true);
  const [showWarnings, setShowWarnings] = useState(true);

  return (
    <div>
      <SectionHeader title="Notifications">Configure notification preferences</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Enable Notifications" description="Show system notifications">
          <Switch checked={enableNotifications} onCheckedChange={setEnableNotifications} />
        </SettingItem>

        <SettingItem label="Sound" description="Play sound for notifications">
          <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
        </SettingItem>

        <SettingItem label="Show Errors" description="Display error notifications">
          <Switch checked={showErrors} onCheckedChange={setShowErrors} />
        </SettingItem>

        <SettingItem label="Show Warnings" description="Display warning notifications">
          <Switch checked={showWarnings} onCheckedChange={setShowWarnings} />
        </SettingItem>
      </div>
    </div>
  );
};

// Tabs settings panel
const TabsSettings: FC = () => {
  const [closeOnComplete, setCloseOnComplete] = useState(false);
  const [maxTabs, setMaxTabs] = useState('10');
  const [showIcons, setShowIcons] = useState(true);

  return (
    <div>
      <SectionHeader title="Tab Behavior">Configure how tabs work</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Close on Task Complete" description="Auto-close tab when task finishes">
          <Switch checked={closeOnComplete} onCheckedChange={setCloseOnComplete} />
        </SettingItem>

        <SettingItem label="Maximum Tabs" description="Limit the number of open tabs">
          <Input
            type="number"
            value={maxTabs}
            onChange={(e) => {
              setMaxTabs(e.target.value);
            }}
            className="w-20 h-8 text-sm"
          />
        </SettingItem>

        <SettingItem label="Show Tab Icons" description="Display icons in tab headers">
          <Switch checked={showIcons} onCheckedChange={setShowIcons} />
        </SettingItem>
      </div>
    </div>
  );
};

// Account settings panel
const AccountSettings: FC = () => {
  return (
    <div>
      <SectionHeader title="Account">Manage your account settings</SectionHeader>

      <div className="rounded-xl border border-border/40 p-4 bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-5 w-5 text-primary/80" />
          </div>
          <div>
            <div className="font-medium text-[13px]">Guest User</div>
            <div className="text-[11px] text-muted-foreground/60">Not signed in</div>
          </div>
        </div>
        <Button variant="outline" className="w-full mt-4" size="sm">
          Sign In
        </Button>
      </div>

      <SectionDivider />

      <SectionHeader title="API Keys">Manage your API credentials</SectionHeader>

      <div className="space-y-3">
        <div>
          <label className="text-[11px] font-medium text-muted-foreground/70">
            Anthropic API Key
          </label>
          <Input type="password" placeholder="sk-ant-..." className="mt-1.5 h-8 text-sm" />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground/70">OpenAI API Key</label>
          <Input type="password" placeholder="sk-..." className="mt-1.5 h-8 text-sm" />
        </div>
      </div>
    </div>
  );
};

// Feedback panel
const FeedbackSettings: FC = () => {
  return (
    <div>
      <SectionHeader title="Provide Feedback">Help us improve Orbit</SectionHeader>

      <div className="space-y-3">
        <div className="rounded-xl border border-border/40 p-4 hover:bg-muted/40 cursor-pointer transition-all duration-150">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-muted-foreground/70" />
            <div>
              <div className="font-medium text-[13px]">Report a Bug</div>
              <div className="text-[11px] text-muted-foreground/60">
                Found something not working? Let us know
              </div>
            </div>
            <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground/50" />
          </div>
        </div>

        <div className="rounded-xl border border-border/40 p-4 hover:bg-muted/40 cursor-pointer transition-all duration-150">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground/70" />
            <div>
              <div className="font-medium text-[13px]">Request a Feature</div>
              <div className="text-[11px] text-muted-foreground/60">
                Have an idea? We&apos;d love to hear it
              </div>
            </div>
            <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground/50" />
          </div>
        </div>
      </div>
    </div>
  );
};

// General settings panel
const GeneralSettings: FC = () => {
  const [language, setLanguage] = useState('en');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [telemetry, setTelemetry] = useState(false);

  return (
    <div>
      <SectionHeader title="Application">General application settings</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Language" description="Choose your preferred language">
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-32 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Español</SelectItem>
              <SelectItem value="fr">Français</SelectItem>
              <SelectItem value="de">Deutsch</SelectItem>
              <SelectItem value="ja">日本語</SelectItem>
            </SelectContent>
          </Select>
        </SettingItem>

        <SettingItem label="Auto Update" description="Automatically check for updates">
          <Switch checked={autoUpdate} onCheckedChange={setAutoUpdate} />
        </SettingItem>

        <SettingItem
          label="Telemetry"
          description="Send anonymous usage data to help improve the app"
        >
          <Switch checked={telemetry} onCheckedChange={setTelemetry} />
        </SettingItem>
      </div>

      <SectionDivider />

      <SectionHeader title="Data">Manage your data and storage</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Clear Cache" description="Remove cached data to free up space">
          <Button variant="outline" size="sm" className="h-8">
            Clear
          </Button>
        </SettingItem>

        <SettingItem label="Export Data" description="Download all your data as a backup">
          <Button variant="outline" size="sm" className="h-8">
            Export
          </Button>
        </SettingItem>
      </div>
    </div>
  );
};

// Appearance settings panel
const AppearanceSettings: FC = () => {
  const [theme, setTheme] = useState('system');
  const [accentColor, setAccentColor] = useState('coral');
  const [fontSize, setFontSize] = useState('medium');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [compactMode, setCompactMode] = useState(false);

  return (
    <div>
      <SectionHeader title="Theme">Customize the look of the application</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Color Theme" description="Choose your preferred color theme">
          <Select value={theme} onValueChange={setTheme}>
            <SelectTrigger className="w-32 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </SettingItem>

        <SettingItem label="Accent Color" description="Primary color for buttons and highlights">
          <Select value={accentColor} onValueChange={setAccentColor}>
            <SelectTrigger className="w-32 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="coral">Coral</SelectItem>
              <SelectItem value="blue">Blue</SelectItem>
              <SelectItem value="green">Green</SelectItem>
              <SelectItem value="purple">Purple</SelectItem>
              <SelectItem value="orange">Orange</SelectItem>
            </SelectContent>
          </Select>
        </SettingItem>
      </div>

      <SectionDivider />

      <SectionHeader title="Text">Customize text appearance</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Font Size" description="Adjust the interface font size">
          <Select value={fontSize} onValueChange={setFontSize}>
            <SelectTrigger className="w-32 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="small">Small</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="large">Large</SelectItem>
            </SelectContent>
          </Select>
        </SettingItem>
      </div>

      <SectionDivider />

      <SectionHeader title="Accessibility">Accessibility options</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Reduce Motion" description="Minimize animations and transitions">
          <Switch checked={reduceMotion} onCheckedChange={setReduceMotion} />
        </SettingItem>

        <SettingItem label="Compact Mode" description="Use a more compact interface layout">
          <Switch checked={compactMode} onCheckedChange={setCompactMode} />
        </SettingItem>
      </div>
    </div>
  );
};

// Shortcut item component
interface ShortcutItemProps {
  readonly label: string;
  readonly keys: string[];
}

const ShortcutItem: FC<ShortcutItemProps> = ({ label, keys }) => (
  <div className="flex items-center justify-between py-2.5">
    <span className="text-[13px] text-muted-foreground/70">{label}</span>
    <KbdGroup>
      {keys.map((key, index) => (
        <Kbd key={index}>{key}</Kbd>
      ))}
    </KbdGroup>
  </div>
);

// Shortcuts settings panel
const ShortcutsSettings: FC = () => {
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
        <ShortcutItem label="Toggle Left Sidebar" keys={['⌘', '.']} />
        <ShortcutItem label="Toggle File Browser" keys={['⌘', 'B']} />
        <ShortcutItem label="Toggle Terminal" keys={['⌘', 'J']} />
        <ShortcutItem label="Toggle Activity" keys={['⌘', 'Shift', 'A']} />
        <ShortcutItem label="Toggle Sessions" keys={['⌘', 'Shift', 'S']} />
      </div>
    </div>
  );
};

// Main dialog component
export const SettingsDialog: FC<SettingsDialogProps> = ({
  open,
  onOpenChange,
  defaultSection = 'agent',
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>(defaultSection);

  // Track which async sections have been visited (so we only mount them once)
  // Once visited, they stay mounted to preserve fetched data
  const [visitedSubagents, setVisitedSubagents] = useState(false);
  const [visitedCommands, setVisitedCommands] = useState(false);

  // Mark async sections as visited when navigating to them
  useEffect(() => {
    if (activeSection === 'subagents') setVisitedSubagents(true);
    if (activeSection === 'commands') setVisitedCommands(true);
  }, [activeSection]);

  // Reset to defaultSection when dialog opens
  useEffect(() => {
    if (open) {
      setActiveSection(defaultSection);
      // Reset visited state when dialog opens fresh
      setVisitedSubagents(defaultSection === 'subagents');
      setVisitedCommands(defaultSection === 'commands');
    }
  }, [open, defaultSection]);

  const navItems = [
    {
      id: 'general' as const,
      label: 'General',
      icon: <IconSettingsKnob className="h-4 w-4" />,
    },
    {
      id: 'appearance' as const,
      label: 'Appearance',
      icon: <IconPaintBucket className="h-4 w-4" />,
    },
    {
      id: 'agent' as const,
      label: 'Agent',
      icon: <Icon iconNode={hexagons7} className="h-4 w-4" />,
    },
    { id: 'subagents' as const, label: 'Subagents', icon: <Bot className="h-4 w-4" /> },
    { id: 'commands' as const, label: 'Commands', icon: <Terminal className="h-4 w-4" /> },
    { id: 'shortcuts' as const, label: 'Shortcuts', icon: <Keyboard className="h-4 w-4" /> },
    { id: 'browser' as const, label: 'Browser', icon: <Globe className="h-4 w-4" /> },
    { id: 'editor' as const, label: 'Editor', icon: <AppWindowMac className="h-4 w-4" /> },
    { id: 'notifications' as const, label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
    { id: 'tabs' as const, label: 'Tabs', icon: <Icon iconNode={tab} className="h-4 w-4" /> },
    { id: 'account' as const, label: 'Account', icon: <User className="h-4 w-4" /> },
  ];

  const feedbackItem = {
    id: 'feedback' as const,
    label: 'Provide Feedback',
    icon: <FlaskConical className="h-4 w-4" />,
  };

  // Render static content (sections without async data) via switch
  const renderStaticContent = (): ReactNode => {
    switch (activeSection) {
      case 'general':
        return <GeneralSettings />;
      case 'appearance':
        return <AppearanceSettings />;
      case 'agent':
        return <AgentSettings />;
      case 'shortcuts':
        return <ShortcutsSettings />;
      case 'browser':
        return <BrowserSettings />;
      case 'editor':
        return <EditorSettings />;
      case 'notifications':
        return <NotificationsSettings />;
      case 'tabs':
        return <TabsSettings />;
      case 'account':
        return <AccountSettings />;
      case 'feedback':
        return <FeedbackSettings />;
      case 'subagents':
      case 'commands':
        // These are rendered separately (kept mounted to prevent re-fetch flash)
        return null;
    }
  };

  // Check if we're on an async section (subagents or commands)
  const isAsyncSection = activeSection === 'subagents' || activeSection === 'commands';

  const getSectionTitle = (): string => {
    if (activeSection === 'feedback') return feedbackItem.label;
    const item = navItems.find((n) => n.id === activeSection);
    return item?.label ?? 'Settings';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-[720px] max-w-[90vw] h-[600px] max-h-[85vh] bg-card border border-border/40 rounded-xl overflow-hidden flex flex-col"
          style={{
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          }}
          aria-describedby={undefined}
        >
          {/* Accessibility: Hidden title for screen readers */}
          <DialogPrimitive.Title className="sr-only">
            Settings - {getSectionTitle()}
          </DialogPrimitive.Title>
          {/* Title bar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-muted/30">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground/70" />
              <span className="font-medium text-[13px]">Settings - {getSectionTitle()}</span>
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 opacity-60 hover:opacity-100 hover:bg-muted/50 active:scale-95 transition-all duration-150">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {/* Content */}
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <div className="w-48 border-r border-border/40 p-2.5 bg-muted/20 flex flex-col">
              <nav className="space-y-1 flex-1">
                {navItems.map((item) => (
                  <NavItem
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    isActive={activeSection === item.id}
                    onClick={() => {
                      setActiveSection(item.id);
                    }}
                  />
                ))}
              </nav>
              {/* Feedback at bottom */}
              <div className="border-t border-border/30 pt-2 mt-2">
                <NavItem
                  icon={feedbackItem.icon}
                  label={feedbackItem.label}
                  isActive={activeSection === 'feedback'}
                  onClick={() => {
                    setActiveSection('feedback');
                  }}
                />
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1 overflow-auto bg-card relative">
              {/* Static sections - render via switch (unmounted when inactive) */}
              {!isAsyncSection && (
                <div className="absolute inset-0 p-6 overflow-auto">{renderStaticContent()}</div>
              )}

              {/* Async sections - kept mounted once visited to prevent re-fetch flash */}
              {/* These fetch data on mount; once visited, they stay mounted to preserve data */}
              {visitedSubagents ? (
                <div
                  className={cn(
                    'absolute inset-0 p-6 overflow-auto',
                    activeSection !== 'subagents' && 'hidden'
                  )}
                >
                  <SubagentsSettings />
                </div>
              ) : null}
              {visitedCommands ? (
                <div
                  className={cn(
                    'absolute inset-0 p-6 overflow-auto',
                    activeSection !== 'commands' && 'hidden'
                  )}
                >
                  <SlashCommandsSettings />
                </div>
              ) : null}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
};

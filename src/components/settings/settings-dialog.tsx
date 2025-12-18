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
  User,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { SubagentsSettings } from './subagents-settings';

import type { FC, ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogPortal } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

type SettingsSection =
  | 'agent'
  | 'subagents'
  | 'browser'
  | 'editor'
  | 'notifications'
  | 'tabs'
  | 'account'
  | 'feedback';

interface SettingsDialogProps {
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
      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
      isActive
        ? 'bg-accent text-accent-foreground'
        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
    )}
  >
    {icon}
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
  <div className="flex items-center justify-between py-3">
    <div className="flex-1 pr-4">
      <div className="text-sm font-medium">{label}</div>
      {description !== undefined && (
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
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
  <div className="mb-4">
    <h3 className="text-sm font-semibold mb-1">{title}</h3>
    {children !== undefined && (
      <p className="text-xs text-muted-foreground">{children}</p>
    )}
  </div>
);

// Section divider
const SectionDivider: FC = () => <div className="h-px bg-border my-6" />;

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

      <div className="space-y-1 divide-y divide-border">
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
      <SectionHeader title="Artifact">
        Configure artifact generation and handling
      </SectionHeader>

      <div className="space-y-1 divide-y divide-border">
        <SettingItem
          label="Enable Artifacts"
          description="Allow the agent to create visual artifacts"
        >
          <Switch checked={artifact} onCheckedChange={setArtifact} />
        </SettingItem>
      </div>

      <SectionDivider />

      {/* Terminal */}
      <SectionHeader title="Terminal">
        Configure terminal behavior and appearance
      </SectionHeader>

      <div className="space-y-1 divide-y divide-border">
        <SettingItem
          label="Terminal Rows"
          description="Number of rows visible in the terminal"
        >
          <Input
            type="number"
            value={terminalRows}
            onChange={(e) => { setTerminalRows(e.target.value); }}
            className="w-20 h-8 text-sm"
          />
        </SettingItem>
      </div>

      <SectionDivider />

      {/* File Access */}
      <SectionHeader title="File Access">
        Control which files the agent can read and modify
      </SectionHeader>

      <div className="space-y-1 divide-y divide-border">
        <SettingItem
          label="File Access Level"
          description="Define the scope of file system access"
        >
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
      <SectionHeader title="Automation">
        Configure autonomous behavior
      </SectionHeader>

      <div className="space-y-1 divide-y divide-border">
        <SettingItem
          label="Enable Auto Mode"
          description="Allow the agent to work autonomously"
        >
          <Switch checked={enableAuto} onCheckedChange={setEnableAuto} />
        </SettingItem>

        <SettingItem
          label="Auto-close on Complete"
          description="Automatically close panels when task completes"
        >
          <Switch checked={autoClose} onCheckedChange={setAutoClose} />
        </SettingItem>

        <SettingItem
          label="Max Turns"
          description="Maximum number of turns in auto mode"
        >
          <Input
            type="number"
            value={maxTurns}
            onChange={(e) => { setMaxTurns(e.target.value); }}
            className="w-20 h-8 text-sm"
          />
        </SettingItem>
      </div>

      <SectionDivider />

      {/* General */}
      <SectionHeader title="General">
        General agent settings
      </SectionHeader>

      <div className="space-y-1 divide-y divide-border">
        <SettingItem
          label="Custom Instructions"
          description="Path to custom instructions file"
        >
          <div className="flex items-center gap-2">
            <Input
              placeholder="CLAUDE.md"
              className="w-40 h-8 text-sm"
            />
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
      <SectionHeader title="Browser">
        Configure browser automation settings
      </SectionHeader>

      <div className="space-y-1 divide-y divide-border">
        <SettingItem
          label="Enable Browser Tool"
          description="Allow the agent to browse websites"
        >
          <Switch checked={enableBrowser} onCheckedChange={setEnableBrowser} />
        </SettingItem>

        <SettingItem
          label="Headless Mode"
          description="Run browser without visible window"
        >
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
      <SectionHeader title="Appearance">
        Customize the editor appearance
      </SectionHeader>

      <div className="space-y-1 divide-y divide-border">
        <SettingItem
          label="Theme"
          description="Choose your preferred color theme"
        >
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

        <SettingItem
          label="Font Size"
          description="Editor font size in pixels"
        >
          <Input
            type="number"
            value={fontSize}
            onChange={(e) => { setFontSize(e.target.value); }}
            className="w-20 h-8 text-sm"
          />
        </SettingItem>

        <SettingItem
          label="Tab Size"
          description="Number of spaces per tab"
        >
          <Input
            type="number"
            value={tabSize}
            onChange={(e) => { setTabSize(e.target.value); }}
            className="w-20 h-8 text-sm"
          />
        </SettingItem>
      </div>

      <SectionDivider />

      <SectionHeader title="Features">
        Toggle editor features
      </SectionHeader>

      <div className="space-y-1 divide-y divide-border">
        <SettingItem
          label="Word Wrap"
          description="Wrap long lines to fit the editor width"
        >
          <Switch checked={wordWrap} onCheckedChange={setWordWrap} />
        </SettingItem>

        <SettingItem
          label="Minimap"
          description="Show code minimap on the side"
        >
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
      <SectionHeader title="Notifications">
        Configure notification preferences
      </SectionHeader>

      <div className="space-y-1 divide-y divide-border">
        <SettingItem
          label="Enable Notifications"
          description="Show system notifications"
        >
          <Switch checked={enableNotifications} onCheckedChange={setEnableNotifications} />
        </SettingItem>

        <SettingItem
          label="Sound"
          description="Play sound for notifications"
        >
          <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
        </SettingItem>

        <SettingItem
          label="Show Errors"
          description="Display error notifications"
        >
          <Switch checked={showErrors} onCheckedChange={setShowErrors} />
        </SettingItem>

        <SettingItem
          label="Show Warnings"
          description="Display warning notifications"
        >
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
      <SectionHeader title="Tab Behavior">
        Configure how tabs work
      </SectionHeader>

      <div className="space-y-1 divide-y divide-border">
        <SettingItem
          label="Close on Task Complete"
          description="Auto-close tab when task finishes"
        >
          <Switch checked={closeOnComplete} onCheckedChange={setCloseOnComplete} />
        </SettingItem>

        <SettingItem
          label="Maximum Tabs"
          description="Limit the number of open tabs"
        >
          <Input
            type="number"
            value={maxTabs}
            onChange={(e) => { setMaxTabs(e.target.value); }}
            className="w-20 h-8 text-sm"
          />
        </SettingItem>

        <SettingItem
          label="Show Tab Icons"
          description="Display icons in tab headers"
        >
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
      <SectionHeader title="Account">
        Manage your account settings
      </SectionHeader>

      <div className="rounded-lg border border-border p-4 bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-medium text-sm">Guest User</div>
            <div className="text-xs text-muted-foreground">Not signed in</div>
          </div>
        </div>
        <Button variant="outline" className="w-full mt-4" size="sm">
          Sign In
        </Button>
      </div>

      <SectionDivider />

      <SectionHeader title="API Keys">
        Manage your API credentials
      </SectionHeader>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Anthropic API Key</label>
          <Input
            type="password"
            placeholder="sk-ant-..."
            className="mt-1 h-8 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">OpenAI API Key</label>
          <Input
            type="password"
            placeholder="sk-..."
            className="mt-1 h-8 text-sm"
          />
        </div>
      </div>
    </div>
  );
};

// Feedback panel
const FeedbackSettings: FC = () => {
  return (
    <div>
      <SectionHeader title="Provide Feedback">
        Help us improve Orbit
      </SectionHeader>

      <div className="space-y-4">
        <div className="rounded-lg border border-border p-4 hover:bg-accent/50 cursor-pointer transition-colors">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="font-medium text-sm">Report a Bug</div>
              <div className="text-xs text-muted-foreground">
                Found something not working? Let us know
              </div>
            </div>
            <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
          </div>
        </div>

        <div className="rounded-lg border border-border p-4 hover:bg-accent/50 cursor-pointer transition-colors">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="font-medium text-sm">Request a Feature</div>
              <div className="text-xs text-muted-foreground">
                Have an idea? We&apos;d love to hear it
              </div>
            </div>
            <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
          </div>
        </div>

        <div className="rounded-lg border border-border p-4 hover:bg-accent/50 cursor-pointer transition-colors">
          <div className="flex items-center gap-3">
            <Keyboard className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="font-medium text-sm">Keyboard Shortcuts</div>
              <div className="text-xs text-muted-foreground">
                View all available shortcuts
              </div>
            </div>
            <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
          </div>
        </div>
      </div>
    </div>
  );
};

// Main dialog component
export const SettingsDialog: FC<SettingsDialogProps> = ({ open, onOpenChange, defaultSection = 'agent' }) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>(defaultSection);

  // Reset to defaultSection when dialog opens
  useEffect(() => {
    if (open) {
      setActiveSection(defaultSection);
    }
  }, [open, defaultSection]);

  const navItems = [
    { id: 'agent' as const, label: 'Agent', icon: <Icon iconNode={hexagons7} className="h-4 w-4" /> },
    { id: 'subagents' as const, label: 'Subagents', icon: <Bot className="h-4 w-4" /> },
    { id: 'browser' as const, label: 'Browser', icon: <Globe className="h-4 w-4" /> },
    { id: 'editor' as const, label: 'Editor', icon: <AppWindowMac className="h-4 w-4" /> },
    { id: 'notifications' as const, label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
    { id: 'tabs' as const, label: 'Tabs', icon: <Icon iconNode={tab} className="h-4 w-4" /> },
    { id: 'account' as const, label: 'Account', icon: <User className="h-4 w-4" /> },
  ];

  const feedbackItem = { id: 'feedback' as const, label: 'Provide Feedback', icon: <FlaskConical className="h-4 w-4" /> };

  const renderContent = (): ReactNode => {
    switch (activeSection) {
      case 'agent':
        return <AgentSettings />;
      case 'subagents':
        return <SubagentsSettings />;
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
    }
  };

  const getSectionTitle = (): string => {
    if (activeSection === 'feedback') return feedbackItem.label;
    const item = navItems.find((n) => n.id === activeSection);
    return item?.label ?? 'Settings';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-[720px] max-w-[90vw] h-[600px] max-h-[85vh] bg-background border border-border rounded-lg shadow-xl overflow-hidden flex flex-col"
          aria-describedby={undefined}
        >
          {/* Accessibility: Hidden title for screen readers */}
          <DialogPrimitive.Title className="sr-only">
            Settings - {getSectionTitle()}
          </DialogPrimitive.Title>
          {/* Title bar */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">Settings - {getSectionTitle()}</span>
            </div>
            <DialogPrimitive.Close className="rounded-sm opacity-70 hover:opacity-100 transition-opacity">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {/* Content */}
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <div className="w-48 border-r border-border p-2 bg-muted/20 flex flex-col">
              <nav className="space-y-1 flex-1">
                {navItems.map((item) => (
                  <NavItem
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    isActive={activeSection === item.id}
                    onClick={() => { setActiveSection(item.id); }}
                  />
                ))}
              </nav>
              {/* Feedback at bottom */}
              <div>
                <NavItem
                  icon={feedbackItem.icon}
                  label={feedbackItem.label}
                  isActive={activeSection === 'feedback'}
                  onClick={() => { setActiveSection('feedback'); }}
                />
              </div>
            </div>

            {/* Main content */}
            <ScrollArea className="flex-1">
              <div className="p-6">{renderContent()}</div>
            </ScrollArea>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
};

/**
 * DirectPreview - Real-time component preview using actual shadcn components
 *
 * Renders the REAL shadcn/ui components from the Canvas app's own copy.
 * This keeps Canvas independent from the agent app while providing:
 * - True live rendering with full interactivity
 * - No transpilation issues
 * - CSS overrides applied as inline styles
 */

import { Button } from '@canvas/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@canvas/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@canvas/components/ui/dropdown-menu';
import { Input } from '@canvas/components/ui/input';
import { Kbd } from '@canvas/components/ui/kbd';
import { ScrollArea } from '@canvas/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@canvas/components/ui/select';
import { Switch } from '@canvas/components/ui/switch';
import { Textarea } from '@canvas/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@canvas/components/ui/tooltip';

import type { FC, ReactNode, CSSProperties } from 'react';

// ============================================
// Constants
// ============================================

const CHAT_AREA_COLORS = {
  light: 'oklch(0.93 0.015 75)',
  dark: 'oklch(0.18 0.012 60)',
} as const;

// ============================================
// Types
// ============================================

interface DirectPreviewProps {
  /** Component name to preview */
  readonly componentName: string | null;
  /** Current theme */
  readonly theme: 'light' | 'dark';
  /** Custom CSS overrides from properties panel */
  readonly cssOverrides?: Record<string, string> | undefined;
}

// ============================================
// Component Registry
// ============================================

/**
 * Maps component names to their demo renderers.
 * Each demo shows the component in a useful default state.
 */
const COMPONENT_DEMOS: Record<string, (style: CSSProperties) => ReactNode> = {
  button: (style) => (
    <div className="flex flex-col gap-3">
      <Button style={style}>Primary Button</Button>
      <Button variant="secondary" style={style}>Secondary</Button>
      <Button variant="outline" style={style}>Outline</Button>
      <Button variant="ghost" style={style}>Ghost</Button>
      <Button variant="destructive" style={style}>Destructive</Button>
    </div>
  ),

  input: (style) => (
    <div className="flex flex-col gap-3 w-64">
      <Input placeholder="Enter text..." style={style} />
      <Input placeholder="Disabled" disabled style={style} />
      <Input type="password" placeholder="Password" style={style} />
    </div>
  ),

  textarea: (style) => (
    <div className="w-64">
      <Textarea placeholder="Enter your message..." style={style} rows={4} />
    </div>
  ),

  switch: (style) => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Switch style={style} />
        <span className="text-sm">Default</span>
      </div>
      <div className="flex items-center gap-2">
        <Switch defaultChecked style={style} />
        <span className="text-sm">Checked</span>
      </div>
    </div>
  ),

  select: (style) => (
    <div className="w-48">
      <Select>
        <SelectTrigger style={style}>
          <SelectValue placeholder="Select option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
          <SelectItem value="option3">Option 3</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),

  tooltip: (style) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" style={style}>Hover me</Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Tooltip content</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),

  dialog: (style) => (
    <Dialog>
      <DialogTrigger asChild>
        <Button style={style}>Open Dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dialog Title</DialogTitle>
          <DialogDescription>
            This is a dialog description. You can put any content here.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p>Dialog content goes here.</p>
        </div>
      </DialogContent>
    </Dialog>
  ),

  'dropdown-menu': (style) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" style={style}>Open Menu</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Profile</DropdownMenuItem>
        <DropdownMenuItem>Settings</DropdownMenuItem>
        <DropdownMenuItem>Logout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),

  'scroll-area': (style) => (
    <ScrollArea className="h-48 w-64 rounded-md border" style={style}>
      <div className="p-4">
        {Array.from({ length: 20 }, (_, i) => (
          <div key={i} className="py-2 border-b last:border-0">
            Item {i + 1}
          </div>
        ))}
      </div>
    </ScrollArea>
  ),

  kbd: (style) => (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1">
        <Kbd style={style}>⌘</Kbd>
        <Kbd style={style}>K</Kbd>
      </div>
      <div className="flex gap-1">
        <Kbd style={style}>Ctrl</Kbd>
        <Kbd style={style}>Shift</Kbd>
        <Kbd style={style}>P</Kbd>
      </div>
    </div>
  ),
};

// List of available components for the "not found" state
const AVAILABLE_COMPONENTS = Object.keys(COMPONENT_DEMOS);

// ============================================
// Component
// ============================================

export const DirectPreview: FC<DirectPreviewProps> = ({
  componentName,
  theme,
  cssOverrides,
}) => {
  const bgColor = CHAT_AREA_COLORS[theme];

  // Convert CSS overrides to CSSProperties
  const style: CSSProperties = cssOverrides ?? {};

  // Placeholder when no component selected
  if (!componentName) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ background: bgColor }}
      >
        <div className="text-center p-8">
          <div className="opacity-50 mb-4">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mx-auto text-muted-foreground"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-muted-foreground mb-1">Preview Area</h2>
          <p className="text-sm text-muted-foreground/70">Select a component from the sidebar</p>
        </div>
      </div>
    );
  }

  // Check if we have a demo for this component
  const demoRenderer = COMPONENT_DEMOS[componentName];

  if (!demoRenderer) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ background: bgColor }}
      >
        <div className="text-center p-8">
          <h2 className="text-lg font-semibold text-muted-foreground mb-2">
            {componentName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
          </h2>
          <p className="text-sm text-muted-foreground/70 mb-4">
            Preview not yet available for this component
          </p>
          <div className="text-xs text-muted-foreground/50">
            <p className="mb-2">Available previews:</p>
            <div className="flex flex-wrap gap-1 justify-center max-w-xs">
              {AVAILABLE_COMPONENTS.map((name) => (
                <span key={name} className="px-2 py-0.5 bg-muted rounded text-xs">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full flex items-center justify-center p-8"
      style={{ background: bgColor }}
    >
      <div className="flex flex-col items-center gap-4">
        <h3 className="text-sm font-medium text-muted-foreground">
          {componentName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
        </h3>
        <div className="p-6 rounded-lg border border-border/30 bg-background/50">
          {demoRenderer(style)}
        </div>
      </div>
    </div>
  );
};

/**
 * shadcn/ui Component Index
 * Pre-indexed components for the Libraries panel
 */

import { LIBRARY_INFO, LIBRARY_SCHEMA_VERSION } from '../componentLibraryTypes';

import type { LibraryIndex, IndexedComponent } from '../componentLibraryTypes';

const shadcnLibrary = LIBRARY_INFO['shadcn'];
if (shadcnLibrary === undefined) throw new Error('shadcn library config missing from LIBRARY_INFO');

const buttonComponent: IndexedComponent = {
  id: 'shadcn-button',
  name: 'Button',
  library: shadcnLibrary,
  category: 'input',
  tags: ['action', 'form', 'clickable', 'primary', 'submit', 'cta'],
  description: 'Interactive button with multiple variants and sizes',
  importStatement: "import { Button } from '@/components/ui/button'",
  code: `import React from 'react';

export default function App() {
  return (
    <button className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 transition-colors">
      Click me
    </button>
  );
}`,
  props: [
    {
      name: 'variant',
      type: '"default" | "destructive" | "outline" | "secondary" | "ghost" | "link"',
      required: false,
      default: 'default',
      description: 'Button style variant',
    },
    {
      name: 'size',
      type: '"default" | "sm" | "lg" | "icon"',
      required: false,
      default: 'default',
      description: 'Button size',
    },
    {
      name: 'asChild',
      type: 'boolean',
      required: false,
      default: false,
      description: 'Render as child element',
    },
  ],
  variants: [
    { name: 'default', props: {}, previewCode: '<Button>Default</Button>' },
    {
      name: 'outline',
      props: { variant: 'outline' },
      previewCode: '<Button variant="outline">Outline</Button>',
    },
    {
      name: 'ghost',
      props: { variant: 'ghost' },
      previewCode: '<Button variant="ghost">Ghost</Button>',
    },
  ],
  dependencies: ['@radix-ui/react-slot'],
  previewCode: '<Button>Click me</Button>',
  livePreviewable: true,
  usageGuidelines: 'Use for primary actions. Use variant="destructive" for dangerous actions.',
  accessibilityNotes: 'Inherits native button accessibility. Use aria-label for icon-only buttons.',
  relatedComponents: ['shadcn-toggle'],
};

const cardComponent: IndexedComponent = {
  id: 'shadcn-card',
  name: 'Card',
  library: shadcnLibrary,
  category: 'display',
  tags: ['container', 'content', 'panel', 'box', 'wrapper'],
  description: 'Container with header, content, and footer sections',
  importStatement:
    "import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="rounded-lg border bg-white shadow-sm w-[350px]">
      <div className="flex flex-col space-y-1.5 p-6">
        <h3 className="text-2xl font-semibold leading-none tracking-tight">Card Title</h3>
        <p className="text-sm text-slate-500">Card description goes here.</p>
      </div>
      <div className="p-6 pt-0">
        <p>This is the main content area of the card.</p>
      </div>
      <div className="flex items-center p-6 pt-0">
        <button className="px-4 py-2 bg-slate-900 text-white text-sm rounded-md hover:bg-slate-800">
          Action
        </button>
      </div>
    </div>
  );
}`,
  props: [],
  variants: [],
  dependencies: [],
  previewCode:
    '<Card><CardHeader><CardTitle>Title</CardTitle></CardHeader><CardContent>Content</CardContent></Card>',
  livePreviewable: true,
  usageGuidelines:
    'Use for grouping related content. Combine with CardHeader, CardContent, CardFooter.',
  accessibilityNotes: 'Use semantic headings in CardTitle.',
  relatedComponents: ['shadcn-dialog'],
};

const inputComponent: IndexedComponent = {
  id: 'shadcn-input',
  name: 'Input',
  library: shadcnLibrary,
  category: 'input',
  tags: ['form', 'text', 'field', 'textbox', 'email', 'password'],
  description: 'Text input field with consistent styling',
  importStatement: "import { Input } from '@/components/ui/input'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="w-full max-w-sm space-y-2 p-4">
      <label className="text-sm font-medium text-slate-900">Email</label>
      <input
        type="email"
        placeholder="Enter your email"
        className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
      />
    </div>
  );
}`,
  props: [
    { name: 'type', type: 'string', required: false, default: 'text', description: 'Input type' },
    { name: 'placeholder', type: 'string', required: false, description: 'Placeholder text' },
    {
      name: 'disabled',
      type: 'boolean',
      required: false,
      default: false,
      description: 'Disable the input',
    },
  ],
  variants: [],
  dependencies: [],
  previewCode: '<Input placeholder="Enter text..." />',
  livePreviewable: true,
  usageGuidelines: 'Use with Label component for accessibility. Wrap in form elements.',
  accessibilityNotes: 'Always provide a label or aria-label.',
  relatedComponents: ['shadcn-label', 'shadcn-textarea'],
};

const badgeComponent: IndexedComponent = {
  id: 'shadcn-badge',
  name: 'Badge',
  library: shadcnLibrary,
  category: 'display',
  tags: ['tag', 'label', 'status', 'chip', 'indicator'],
  description: 'Small status indicator or label',
  importStatement: "import { Badge } from '@/components/ui/badge'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="flex flex-wrap gap-2 p-4">
      <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-slate-900 text-white">
        Default
      </span>
      <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-900">
        Secondary
      </span>
      <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-red-500 text-white">
        Destructive
      </span>
      <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold text-slate-900">
        Outline
      </span>
    </div>
  );
}`,
  props: [
    {
      name: 'variant',
      type: '"default" | "secondary" | "destructive" | "outline"',
      required: false,
      default: 'default',
      description: 'Badge style variant',
    },
  ],
  variants: [
    { name: 'default', props: {}, previewCode: '<Badge>Default</Badge>' },
    {
      name: 'secondary',
      props: { variant: 'secondary' },
      previewCode: '<Badge variant="secondary">Secondary</Badge>',
    },
    {
      name: 'destructive',
      props: { variant: 'destructive' },
      previewCode: '<Badge variant="destructive">Error</Badge>',
    },
  ],
  dependencies: [],
  previewCode: '<Badge>New</Badge>',
  livePreviewable: true,
  usageGuidelines: 'Use for status indicators, counts, or categorization.',
  accessibilityNotes: 'Ensure sufficient color contrast.',
  relatedComponents: [],
};

const avatarComponent: IndexedComponent = {
  id: 'shadcn-avatar',
  name: 'Avatar',
  library: shadcnLibrary,
  category: 'display',
  tags: ['user', 'profile', 'image', 'photo', 'picture'],
  description: 'User avatar with image and fallback',
  importStatement: "import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="flex gap-4 p-4">
      <div className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full">
        <img
          src="https://github.com/shadcn.png"
          alt="User"
          className="aspect-square h-full w-full"
        />
      </div>
      <div className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-slate-100">
        <span className="flex h-full w-full items-center justify-center text-sm font-medium">
          JD
        </span>
      </div>
    </div>
  );
}`,
  props: [],
  variants: [],
  dependencies: ['@radix-ui/react-avatar'],
  previewCode: '<Avatar><AvatarImage src="..." /><AvatarFallback>JD</AvatarFallback></Avatar>',
  livePreviewable: true,
  usageGuidelines: 'Use for user profiles. Always provide fallback initials.',
  accessibilityNotes: 'Include alt text for images.',
  relatedComponents: [],
};

const switchComponent: IndexedComponent = {
  id: 'shadcn-switch',
  name: 'Switch',
  library: shadcnLibrary,
  category: 'input',
  tags: ['toggle', 'boolean', 'on-off', 'setting', 'preference'],
  description: 'Toggle switch for boolean settings',
  importStatement: "import { Switch } from '@/components/ui/switch'",
  code: `import React from 'react';

export default function App() {
  const [enabled, setEnabled] = React.useState(false);

  return (
    <div className="flex items-center space-x-2 p-4">
      <button
        role="switch"
        aria-checked={enabled}
        onClick={() => setEnabled(!enabled)}
        className={\`peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors \${enabled ? 'bg-slate-900' : 'bg-slate-200'}\`}
      >
        <span
          className={\`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform \${enabled ? 'translate-x-5' : 'translate-x-0'}\`}
        />
      </button>
      <label className="text-sm font-medium">Airplane Mode</label>
    </div>
  );
}`,
  props: [
    { name: 'checked', type: 'boolean', required: false, description: 'Controlled checked state' },
    {
      name: 'onCheckedChange',
      type: '(checked: boolean) => void',
      required: false,
      description: 'Change handler',
    },
    {
      name: 'disabled',
      type: 'boolean',
      required: false,
      default: false,
      description: 'Disable the switch',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-switch'],
  previewCode: '<Switch />',
  livePreviewable: true,
  usageGuidelines: 'Use for immediate-effect boolean settings.',
  accessibilityNotes: 'Uses role="switch" for screen readers.',
  relatedComponents: ['shadcn-checkbox'],
};

const checkboxComponent: IndexedComponent = {
  id: 'shadcn-checkbox',
  name: 'Checkbox',
  library: shadcnLibrary,
  category: 'input',
  tags: ['form', 'boolean', 'check', 'select', 'multi-select'],
  description: 'Checkbox input for boolean or multi-select options',
  importStatement: "import { Checkbox } from '@/components/ui/checkbox'",
  code: `import React from 'react';

export default function App() {
  const [checked, setChecked] = React.useState(false);

  return (
    <div className="flex items-center space-x-2 p-4">
      <button
        role="checkbox"
        aria-checked={checked}
        onClick={() => setChecked(!checked)}
        className={\`h-4 w-4 shrink-0 rounded-sm border border-slate-900 \${checked ? 'bg-slate-900 text-white' : 'bg-white'}\`}
      >
        {checked && (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <label className="text-sm font-medium leading-none">
        Accept terms and conditions
      </label>
    </div>
  );
}`,
  props: [
    { name: 'checked', type: 'boolean', required: false, description: 'Controlled checked state' },
    {
      name: 'onCheckedChange',
      type: '(checked: boolean) => void',
      required: false,
      description: 'Change handler',
    },
    {
      name: 'disabled',
      type: 'boolean',
      required: false,
      default: false,
      description: 'Disable the checkbox',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-checkbox'],
  previewCode: '<Checkbox id="terms" />',
  livePreviewable: true,
  usageGuidelines: 'Use in forms for boolean options or multi-select lists.',
  accessibilityNotes: 'Always pair with a label element.',
  relatedComponents: ['shadcn-switch'],
};

const selectComponent: IndexedComponent = {
  id: 'shadcn-select',
  name: 'Select',
  library: shadcnLibrary,
  category: 'input',
  tags: ['dropdown', 'picker', 'menu', 'form', 'option'],
  description: 'Dropdown select menu with search support',
  importStatement:
    "import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'",
  code: `import React from 'react';

export default function App() {
  const [value, setValue] = React.useState('');
  const [open, setOpen] = React.useState(false);

  const options = ['Apple', 'Banana', 'Orange', 'Grape'];

  return (
    <div className="w-[200px] p-4">
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <span>{value || 'Select a fruit'}</span>
          <svg className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-md">
            {options.map((option) => (
              <div
                key={option}
                onClick={() => { setValue(option); setOpen(false); }}
                className="cursor-pointer px-3 py-2 text-sm hover:bg-slate-100"
              >
                {option}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}`,
  props: [
    { name: 'value', type: 'string', required: false, description: 'Controlled value' },
    {
      name: 'onValueChange',
      type: '(value: string) => void',
      required: false,
      description: 'Change handler',
    },
    {
      name: 'disabled',
      type: 'boolean',
      required: false,
      default: false,
      description: 'Disable the select',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-select'],
  previewCode:
    '<Select><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger><SelectContent>...</SelectContent></Select>',
  livePreviewable: true,
  usageGuidelines: 'Use for single-option selection from a list.',
  accessibilityNotes: 'Fully keyboard navigable.',
  relatedComponents: ['shadcn-combobox'],
};

const dialogComponent: IndexedComponent = {
  id: 'shadcn-dialog',
  name: 'Dialog',
  library: shadcnLibrary,
  category: 'overlay',
  tags: ['modal', 'popup', 'overlay', 'confirm', 'alert'],
  description: 'Modal dialog with customizable content',
  importStatement:
    "import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'",
  code: `import React from 'react';

export default function App() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="p-4">
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800"
      >
        Open Dialog
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/80" onClick={() => setOpen(false)} />
          <div className="relative z-50 w-full max-w-lg rounded-lg border bg-white p-6 shadow-lg">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="flex flex-col space-y-1.5 text-center sm:text-left">
              <h2 className="text-lg font-semibold">Are you sure?</h2>
              <p className="text-sm text-slate-500">
                This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-md hover:bg-red-600">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}`,
  props: [
    { name: 'open', type: 'boolean', required: false, description: 'Controlled open state' },
    {
      name: 'onOpenChange',
      type: '(open: boolean) => void',
      required: false,
      description: 'Open state change handler',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-dialog'],
  previewCode:
    '<Dialog><DialogTrigger>Open</DialogTrigger><DialogContent>...</DialogContent></Dialog>',
  livePreviewable: true,
  usageGuidelines: 'Use for confirmations, forms, or focused content.',
  accessibilityNotes: 'Traps focus and handles escape key.',
  relatedComponents: ['shadcn-alert-dialog', 'shadcn-sheet'],
};

const alertComponent: IndexedComponent = {
  id: 'shadcn-alert',
  name: 'Alert',
  library: shadcnLibrary,
  category: 'feedback',
  tags: ['message', 'notification', 'info', 'warning', 'error', 'success'],
  description: 'Alert message with variants for different states',
  importStatement: "import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="w-[400px] space-y-4 p-4">
      <div className="relative w-full rounded-lg border p-4 bg-white">
        <svg className="absolute left-4 top-4 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="pl-7">
          <h5 className="mb-1 font-medium leading-none tracking-tight">Heads up!</h5>
          <div className="text-sm text-slate-500">You can add components using the CLI.</div>
        </div>
      </div>

      <div className="relative w-full rounded-lg border border-red-500/50 bg-red-50 p-4 text-red-500">
        <svg className="absolute left-4 top-4 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="pl-7">
          <h5 className="mb-1 font-medium leading-none tracking-tight">Error</h5>
          <div className="text-sm">Your session has expired.</div>
        </div>
      </div>
    </div>
  );
}`,
  props: [
    {
      name: 'variant',
      type: '"default" | "destructive"',
      required: false,
      default: 'default',
      description: 'Alert style variant',
    },
  ],
  variants: [
    { name: 'default', props: {}, previewCode: '<Alert>Info message</Alert>' },
    {
      name: 'destructive',
      props: { variant: 'destructive' },
      previewCode: '<Alert variant="destructive">Error</Alert>',
    },
  ],
  dependencies: [],
  previewCode:
    '<Alert><AlertTitle>Title</AlertTitle><AlertDescription>Description</AlertDescription></Alert>',
  livePreviewable: true,
  usageGuidelines: 'Use for important messages that require attention.',
  accessibilityNotes: 'Uses role="alert" for screen readers.',
  relatedComponents: ['shadcn-toast'],
};

const progressComponent: IndexedComponent = {
  id: 'shadcn-progress',
  name: 'Progress',
  library: shadcnLibrary,
  category: 'feedback',
  tags: ['loading', 'percentage', 'bar', 'status', 'completion'],
  description: 'Progress bar indicator',
  importStatement: "import { Progress } from '@/components/ui/progress'",
  code: `import React from 'react';

export default function App() {
  const [progress, setProgress] = React.useState(13);

  React.useEffect(() => {
    const timer = setTimeout(() => setProgress(66), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="w-[300px] p-4">
      <div className="relative h-4 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full bg-slate-900 transition-all"
          style={{ width: \`\${progress}%\` }}
        />
      </div>
      <p className="mt-2 text-sm text-slate-500">{progress}% complete</p>
    </div>
  );
}`,
  props: [
    {
      name: 'value',
      type: 'number',
      required: false,
      default: 0,
      description: 'Progress value (0-100)',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-progress'],
  previewCode: '<Progress value={66} />',
  livePreviewable: true,
  usageGuidelines: 'Use for file uploads, step indicators, or loading states.',
  accessibilityNotes: 'Uses role="progressbar" with aria-valuenow.',
  relatedComponents: [],
};

const tabsComponent: IndexedComponent = {
  id: 'shadcn-tabs',
  name: 'Tabs',
  library: shadcnLibrary,
  category: 'navigation',
  tags: ['navigation', 'sections', 'panel', 'switch', 'tabbed'],
  description: 'Tabbed content navigation',
  importStatement:
    "import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'",
  code: `import React from 'react';

export default function App() {
  const [activeTab, setActiveTab] = React.useState('account');

  return (
    <div className="w-[400px] p-4">
      <div className="inline-flex h-10 items-center justify-center rounded-md bg-slate-100 p-1">
        <button
          onClick={() => setActiveTab('account')}
          className={\`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all \${activeTab === 'account' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}\`}
        >
          Account
        </button>
        <button
          onClick={() => setActiveTab('password')}
          className={\`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all \${activeTab === 'password' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}\`}
        >
          Password
        </button>
      </div>

      {activeTab === 'account' && (
        <div className="mt-2 rounded-lg border p-4">
          <h3 className="text-lg font-medium">Account</h3>
          <p className="text-sm text-slate-500 mt-1">
            Make changes to your account here.
          </p>
        </div>
      )}

      {activeTab === 'password' && (
        <div className="mt-2 rounded-lg border p-4">
          <h3 className="text-lg font-medium">Password</h3>
          <p className="text-sm text-slate-500 mt-1">
            Change your password here.
          </p>
        </div>
      )}
    </div>
  );
}`,
  props: [
    { name: 'value', type: 'string', required: false, description: 'Controlled active tab value' },
    {
      name: 'onValueChange',
      type: '(value: string) => void',
      required: false,
      description: 'Tab change handler',
    },
    { name: 'defaultValue', type: 'string', required: false, description: 'Default active tab' },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-tabs'],
  previewCode:
    '<Tabs defaultValue="tab1"><TabsList><TabsTrigger value="tab1">Tab 1</TabsTrigger></TabsList><TabsContent value="tab1">Content</TabsContent></Tabs>',
  livePreviewable: true,
  usageGuidelines: 'Use for organizing related content into sections.',
  accessibilityNotes: 'Fully keyboard navigable with arrow keys.',
  relatedComponents: [],
};

const tooltipComponent: IndexedComponent = {
  id: 'shadcn-tooltip',
  name: 'Tooltip',
  library: shadcnLibrary,
  category: 'overlay',
  tags: ['hint', 'help', 'info', 'hover', 'popover'],
  description: 'Tooltip that appears on hover',
  importStatement:
    "import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'",
  code: `import React from 'react';

export default function App() {
  const [show, setShow] = React.useState(false);

  return (
    <div className="p-8">
      <div className="relative inline-block">
        <button
          onMouseEnter={() => setShow(true)}
          onMouseLeave={() => setShow(false)}
          className="px-4 py-2 bg-slate-100 rounded-md text-sm font-medium hover:bg-slate-200"
        >
          Hover me
        </button>
        {show && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-900 text-white text-sm rounded-md">
            This is a tooltip
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
          </div>
        )}
      </div>
    </div>
  );
}`,
  props: [],
  variants: [],
  dependencies: ['@radix-ui/react-tooltip'],
  previewCode:
    '<TooltipProvider><Tooltip><TooltipTrigger>Hover</TooltipTrigger><TooltipContent>Tooltip</TooltipContent></Tooltip></TooltipProvider>',
  livePreviewable: true,
  usageGuidelines: 'Use for supplementary information on hover.',
  accessibilityNotes: 'Content is announced to screen readers.',
  relatedComponents: ['shadcn-popover'],
};

const separatorComponent: IndexedComponent = {
  id: 'shadcn-separator',
  name: 'Separator',
  library: shadcnLibrary,
  category: 'layout',
  tags: ['divider', 'line', 'hr', 'split'],
  description: 'Visual separator between content sections',
  importStatement: "import { Separator } from '@/components/ui/separator'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-4">
      <div className="space-y-1">
        <h4 className="text-sm font-medium leading-none">Radix Primitives</h4>
        <p className="text-sm text-slate-500">
          An open-source UI component library.
        </p>
      </div>
      <div className="my-4 h-[1px] w-full bg-slate-200" />
      <div className="flex h-5 items-center space-x-4 text-sm">
        <div>Blog</div>
        <div className="h-full w-[1px] bg-slate-200" />
        <div>Docs</div>
        <div className="h-full w-[1px] bg-slate-200" />
        <div>Source</div>
      </div>
    </div>
  );
}`,
  props: [
    {
      name: 'orientation',
      type: '"horizontal" | "vertical"',
      required: false,
      default: 'horizontal',
      description: 'Separator orientation',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-separator'],
  previewCode: '<Separator />',
  livePreviewable: true,
  usageGuidelines: 'Use to visually separate content sections.',
  accessibilityNotes: 'Uses role="separator".',
  relatedComponents: [],
};

const skeletonComponent: IndexedComponent = {
  id: 'shadcn-skeleton',
  name: 'Skeleton',
  library: shadcnLibrary,
  category: 'feedback',
  tags: ['loading', 'placeholder', 'shimmer', 'loader'],
  description: 'Loading placeholder with animation',
  importStatement: "import { Skeleton } from '@/components/ui/skeleton'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="flex items-center space-x-4 p-4">
      <div className="h-12 w-12 rounded-full bg-slate-200 animate-pulse" />
      <div className="space-y-2">
        <div className="h-4 w-[250px] rounded bg-slate-200 animate-pulse" />
        <div className="h-4 w-[200px] rounded bg-slate-200 animate-pulse" />
      </div>
    </div>
  );
}`,
  props: [],
  variants: [],
  dependencies: [],
  previewCode: '<Skeleton className="h-4 w-[250px]" />',
  livePreviewable: true,
  usageGuidelines: 'Use as placeholders while content is loading.',
  accessibilityNotes: 'Hide from screen readers with aria-hidden.',
  relatedComponents: [],
};

const labelComponent: IndexedComponent = {
  id: 'shadcn-label',
  name: 'Label',
  library: shadcnLibrary,
  category: 'input',
  tags: ['form', 'text', 'accessibility', 'field'],
  description: 'Accessible label for form inputs',
  importStatement: "import { Label } from '@/components/ui/label'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="grid w-full max-w-sm items-center gap-1.5 p-4">
      <label htmlFor="email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
        Email
      </label>
      <input
        type="email"
        id="email"
        placeholder="Email"
        className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
      />
    </div>
  );
}`,
  props: [
    {
      name: 'htmlFor',
      type: 'string',
      required: false,
      description: 'ID of the input this label is for',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-label'],
  previewCode: '<Label htmlFor="email">Email</Label>',
  livePreviewable: true,
  usageGuidelines: 'Always pair with form inputs for accessibility.',
  accessibilityNotes: 'Associates with input via htmlFor attribute.',
  relatedComponents: ['shadcn-input', 'shadcn-textarea'],
};

const textareaComponent: IndexedComponent = {
  id: 'shadcn-textarea',
  name: 'Textarea',
  library: shadcnLibrary,
  category: 'input',
  tags: ['form', 'text', 'multiline', 'input', 'comment'],
  description: 'Multi-line text input field',
  importStatement: "import { Textarea } from '@/components/ui/textarea'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="grid w-full gap-1.5 p-4">
      <label htmlFor="message" className="text-sm font-medium">Your message</label>
      <textarea
        id="message"
        placeholder="Type your message here."
        className="flex min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
      />
    </div>
  );
}`,
  props: [
    { name: 'placeholder', type: 'string', required: false, description: 'Placeholder text' },
    {
      name: 'disabled',
      type: 'boolean',
      required: false,
      default: false,
      description: 'Disable the textarea',
    },
  ],
  variants: [],
  dependencies: [],
  previewCode: '<Textarea placeholder="Type here..." />',
  livePreviewable: true,
  usageGuidelines: 'Use for multi-line text input like comments or descriptions.',
  accessibilityNotes: 'Always provide a label.',
  relatedComponents: ['shadcn-input', 'shadcn-label'],
};

const sliderComponent: IndexedComponent = {
  id: 'shadcn-slider',
  name: 'Slider',
  library: shadcnLibrary,
  category: 'input',
  tags: ['range', 'input', 'value', 'volume', 'control'],
  description: 'Range slider for selecting numeric values',
  importStatement: "import { Slider } from '@/components/ui/slider'",
  code: `import React from 'react';

export default function App() {
  const [value, setValue] = React.useState([50]);

  return (
    <div className="w-[300px] p-4">
      <div className="relative flex w-full touch-none select-none items-center">
        <div className="relative h-2 w-full grow overflow-hidden rounded-full bg-slate-200">
          <div className="absolute h-full bg-slate-900" style={{ width: \`\${value[0]}%\` }} />
        </div>
        <div
          className="block h-5 w-5 rounded-full border-2 border-slate-900 bg-white shadow cursor-pointer"
          style={{ position: 'absolute', left: \`calc(\${value[0]}% - 10px)\` }}
        />
      </div>
      <p className="mt-2 text-sm text-slate-500">Value: {value[0]}</p>
    </div>
  );
}`,
  props: [
    { name: 'value', type: 'number[]', required: false, description: 'Controlled value' },
    {
      name: 'onValueChange',
      type: '(value: number[]) => void',
      required: false,
      description: 'Value change handler',
    },
    { name: 'min', type: 'number', required: false, default: 0, description: 'Minimum value' },
    { name: 'max', type: 'number', required: false, default: 100, description: 'Maximum value' },
    { name: 'step', type: 'number', required: false, default: 1, description: 'Step increment' },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-slider'],
  previewCode: '<Slider defaultValue={[50]} max={100} step={1} />',
  livePreviewable: true,
  usageGuidelines: 'Use for selecting values within a range.',
  accessibilityNotes: 'Fully keyboard navigable with arrow keys.',
  relatedComponents: ['shadcn-progress'],
};

const radioGroupComponent: IndexedComponent = {
  id: 'shadcn-radio-group',
  name: 'Radio Group',
  library: shadcnLibrary,
  category: 'input',
  tags: ['form', 'selection', 'options', 'choice', 'radio'],
  description: 'Radio button group for single selection',
  importStatement: "import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'",
  code: `import React from 'react';

export default function App() {
  const [selected, setSelected] = React.useState('comfortable');

  return (
    <div className="p-4">
      <div className="flex flex-col space-y-2" role="radiogroup">
        {['default', 'comfortable', 'compact'].map((option) => (
          <div key={option} className="flex items-center space-x-2">
            <button
              role="radio"
              aria-checked={selected === option}
              onClick={() => setSelected(option)}
              className={\`h-4 w-4 rounded-full border \${selected === option ? 'border-slate-900' : 'border-slate-300'}\`}
            >
              {selected === option && (
                <div className="flex h-full w-full items-center justify-center">
                  <div className="h-2.5 w-2.5 rounded-full bg-slate-900" />
                </div>
              )}
            </button>
            <label className="text-sm font-medium capitalize">{option}</label>
          </div>
        ))}
      </div>
    </div>
  );
}`,
  props: [
    { name: 'value', type: 'string', required: false, description: 'Controlled value' },
    {
      name: 'onValueChange',
      type: '(value: string) => void',
      required: false,
      description: 'Value change handler',
    },
    {
      name: 'defaultValue',
      type: 'string',
      required: false,
      description: 'Default selected value',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-radio-group'],
  previewCode:
    '<RadioGroup defaultValue="option1"><RadioGroupItem value="option1" /><RadioGroupItem value="option2" /></RadioGroup>',
  livePreviewable: true,
  usageGuidelines: 'Use for mutually exclusive options.',
  accessibilityNotes: 'Uses role="radiogroup" for screen readers.',
  relatedComponents: ['shadcn-checkbox'],
};

const toggleComponent: IndexedComponent = {
  id: 'shadcn-toggle',
  name: 'Toggle',
  library: shadcnLibrary,
  category: 'input',
  tags: ['button', 'pressed', 'state', 'on-off', 'action'],
  description: 'Toggle button with pressed state',
  importStatement: "import { Toggle } from '@/components/ui/toggle'",
  code: `import React from 'react';

export default function App() {
  const [pressed, setPressed] = React.useState(false);

  return (
    <div className="p-4">
      <button
        aria-pressed={pressed}
        onClick={() => setPressed(!pressed)}
        className={\`inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-3 \${pressed ? 'bg-slate-200' : 'bg-transparent hover:bg-slate-100'}\`}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </button>
    </div>
  );
}`,
  props: [
    { name: 'pressed', type: 'boolean', required: false, description: 'Controlled pressed state' },
    {
      name: 'onPressedChange',
      type: '(pressed: boolean) => void',
      required: false,
      description: 'Press change handler',
    },
    {
      name: 'variant',
      type: '"default" | "outline"',
      required: false,
      default: 'default',
      description: 'Toggle style variant',
    },
    {
      name: 'size',
      type: '"default" | "sm" | "lg"',
      required: false,
      default: 'default',
      description: 'Toggle size',
    },
  ],
  variants: [
    { name: 'default', props: {}, previewCode: '<Toggle>Toggle</Toggle>' },
    {
      name: 'outline',
      props: { variant: 'outline' },
      previewCode: '<Toggle variant="outline">Outline</Toggle>',
    },
  ],
  dependencies: ['@radix-ui/react-toggle'],
  previewCode: '<Toggle aria-label="Toggle bold"><Bold /></Toggle>',
  livePreviewable: true,
  usageGuidelines: 'Use for toggling formatting options or features.',
  accessibilityNotes: 'Uses aria-pressed for screen readers.',
  relatedComponents: ['shadcn-toggle-group', 'shadcn-button'],
};

const toggleGroupComponent: IndexedComponent = {
  id: 'shadcn-toggle-group',
  name: 'Toggle Group',
  library: shadcnLibrary,
  category: 'input',
  tags: ['button', 'group', 'selection', 'toolbar', 'options'],
  description: 'Group of toggle buttons with single or multiple selection',
  importStatement: "import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'",
  code: `import React from 'react';

export default function App() {
  const [value, setValue] = React.useState('center');

  return (
    <div className="p-4">
      <div className="inline-flex h-10 items-center justify-center rounded-md bg-slate-100 p-1" role="group">
        {['left', 'center', 'right'].map((align) => (
          <button
            key={align}
            onClick={() => setValue(align)}
            className={\`inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-sm font-medium \${value === align ? 'bg-white shadow-sm' : 'hover:bg-slate-200'}\`}
          >
            {align.charAt(0).toUpperCase() + align.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}`,
  props: [
    {
      name: 'type',
      type: '"single" | "multiple"',
      required: true,
      description: 'Single or multiple selection',
    },
    { name: 'value', type: 'string | string[]', required: false, description: 'Controlled value' },
    {
      name: 'onValueChange',
      type: '(value: string | string[]) => void',
      required: false,
      description: 'Value change handler',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-toggle-group'],
  previewCode:
    '<ToggleGroup type="single"><ToggleGroupItem value="a">A</ToggleGroupItem><ToggleGroupItem value="b">B</ToggleGroupItem></ToggleGroup>',
  livePreviewable: true,
  usageGuidelines: 'Use for toolbar buttons or segmented controls.',
  accessibilityNotes: 'Uses role="group" for screen readers.',
  relatedComponents: ['shadcn-toggle', 'shadcn-tabs'],
};

const accordionComponent: IndexedComponent = {
  id: 'shadcn-accordion',
  name: 'Accordion',
  library: shadcnLibrary,
  category: 'display',
  tags: ['collapse', 'expand', 'faq', 'disclosure', 'panel'],
  description: 'Collapsible content sections',
  importStatement:
    "import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'",
  code: `import React from 'react';

export default function App() {
  const [open, setOpen] = React.useState('item-1');

  const items = [
    { id: 'item-1', title: 'Is it accessible?', content: 'Yes. It adheres to the WAI-ARIA design pattern.' },
    { id: 'item-2', title: 'Is it styled?', content: 'Yes. It comes with default styles that match your theme.' },
    { id: 'item-3', title: 'Is it animated?', content: 'Yes. It uses CSS animations for smooth transitions.' },
  ];

  return (
    <div className="w-[400px] p-4">
      {items.map((item) => (
        <div key={item.id} className="border-b">
          <button
            onClick={() => setOpen(open === item.id ? '' : item.id)}
            className="flex w-full items-center justify-between py-4 font-medium transition-all hover:underline"
          >
            {item.title}
            <svg
              className={\`h-4 w-4 shrink-0 transition-transform \${open === item.id ? 'rotate-180' : ''}\`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {open === item.id && (
            <div className="pb-4 pt-0 text-sm text-slate-500">
              {item.content}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}`,
  props: [
    {
      name: 'type',
      type: '"single" | "multiple"',
      required: false,
      default: 'single',
      description: 'Single or multiple open items',
    },
    {
      name: 'collapsible',
      type: 'boolean',
      required: false,
      default: false,
      description: 'Allow collapsing all items',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-accordion'],
  previewCode:
    '<Accordion type="single"><AccordionItem value="item-1"><AccordionTrigger>Title</AccordionTrigger><AccordionContent>Content</AccordionContent></AccordionItem></Accordion>',
  livePreviewable: true,
  usageGuidelines: 'Use for FAQs or collapsible content sections.',
  accessibilityNotes: 'Fully keyboard navigable.',
  relatedComponents: ['shadcn-collapsible'],
};

const sheetComponent: IndexedComponent = {
  id: 'shadcn-sheet',
  name: 'Sheet',
  library: shadcnLibrary,
  category: 'overlay',
  tags: ['drawer', 'sidebar', 'panel', 'slide', 'modal'],
  description: 'Slide-out panel from screen edge',
  importStatement:
    "import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet'",
  code: `import React from 'react';

export default function App() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="p-4">
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800"
      >
        Open Sheet
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black/80" onClick={() => setOpen(false)} />
          <div className="fixed inset-y-0 right-0 z-50 h-full w-3/4 max-w-sm border-l bg-white p-6 shadow-lg">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="flex flex-col space-y-2">
              <h2 className="text-lg font-semibold">Edit Profile</h2>
              <p className="text-sm text-slate-500">
                Make changes to your profile here.
              </p>
            </div>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <input className="flex h-10 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <button className="w-full px-4 py-2 bg-slate-900 text-white text-sm rounded-md">
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}`,
  props: [
    {
      name: 'side',
      type: '"top" | "right" | "bottom" | "left"',
      required: false,
      default: 'right',
      description: 'Side to slide from',
    },
    { name: 'open', type: 'boolean', required: false, description: 'Controlled open state' },
    {
      name: 'onOpenChange',
      type: '(open: boolean) => void',
      required: false,
      description: 'Open state change handler',
    },
  ],
  variants: [
    { name: 'right', props: { side: 'right' }, previewCode: '<Sheet side="right">...</Sheet>' },
    { name: 'left', props: { side: 'left' }, previewCode: '<Sheet side="left">...</Sheet>' },
    { name: 'bottom', props: { side: 'bottom' }, previewCode: '<Sheet side="bottom">...</Sheet>' },
  ],
  dependencies: ['@radix-ui/react-dialog'],
  previewCode:
    '<Sheet><SheetTrigger>Open</SheetTrigger><SheetContent>Content</SheetContent></Sheet>',
  livePreviewable: true,
  usageGuidelines: 'Use for side panels, settings, or secondary navigation.',
  accessibilityNotes: 'Traps focus and handles escape key.',
  relatedComponents: ['shadcn-dialog', 'shadcn-drawer'],
};

const popoverComponent: IndexedComponent = {
  id: 'shadcn-popover',
  name: 'Popover',
  library: shadcnLibrary,
  category: 'overlay',
  tags: ['dropdown', 'popup', 'floating', 'tooltip', 'menu'],
  description: 'Floating content triggered by button',
  importStatement:
    "import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'",
  code: `import React from 'react';

export default function App() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="p-8 flex justify-center">
      <div className="relative inline-block">
        <button
          onClick={() => setOpen(!open)}
          className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-slate-100"
        >
          Open popover
        </button>

        {open && (
          <div className="absolute z-50 mt-2 w-80 rounded-md border bg-white p-4 shadow-md">
            <div className="grid gap-4">
              <div className="space-y-2">
                <h4 className="font-medium leading-none">Dimensions</h4>
                <p className="text-sm text-slate-500">
                  Set the dimensions for the layer.
                </p>
              </div>
              <div className="grid gap-2">
                <div className="grid grid-cols-3 items-center gap-4">
                  <label className="text-sm">Width</label>
                  <input className="col-span-2 h-8 rounded border px-2 text-sm" defaultValue="100%" />
                </div>
                <div className="grid grid-cols-3 items-center gap-4">
                  <label className="text-sm">Height</label>
                  <input className="col-span-2 h-8 rounded border px-2 text-sm" defaultValue="25px" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}`,
  props: [
    { name: 'open', type: 'boolean', required: false, description: 'Controlled open state' },
    {
      name: 'onOpenChange',
      type: '(open: boolean) => void',
      required: false,
      description: 'Open state change handler',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-popover'],
  previewCode:
    '<Popover><PopoverTrigger>Open</PopoverTrigger><PopoverContent>Content</PopoverContent></Popover>',
  livePreviewable: true,
  usageGuidelines: 'Use for floating forms, pickers, or additional controls.',
  accessibilityNotes: 'Manages focus and keyboard navigation.',
  relatedComponents: ['shadcn-tooltip', 'shadcn-dropdown-menu'],
};

const dropdownMenuComponent: IndexedComponent = {
  id: 'shadcn-dropdown-menu',
  name: 'Dropdown Menu',
  library: shadcnLibrary,
  category: 'overlay',
  tags: ['menu', 'actions', 'context', 'options', 'popup'],
  description: 'Menu with actions and submenus',
  importStatement:
    "import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'",
  code: `import React from 'react';

export default function App() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="p-8 flex justify-center">
      <div className="relative inline-block">
        <button
          onClick={() => setOpen(!open)}
          className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800"
        >
          Open Menu
        </button>

        {open && (
          <div className="absolute z-50 mt-2 w-56 rounded-md border bg-white shadow-lg">
            <div className="p-1">
              <div className="px-2 py-1.5 text-sm font-semibold">My Account</div>
              <div className="h-px bg-slate-200 my-1" />
              <button className="w-full flex items-center rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100">
                Profile
              </button>
              <button className="w-full flex items-center rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100">
                Settings
              </button>
              <button className="w-full flex items-center rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100">
                Keyboard shortcuts
              </button>
              <div className="h-px bg-slate-200 my-1" />
              <button className="w-full flex items-center rounded-sm px-2 py-1.5 text-sm text-red-500 hover:bg-red-50">
                Log out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}`,
  props: [],
  variants: [],
  dependencies: ['@radix-ui/react-dropdown-menu'],
  previewCode:
    '<DropdownMenu><DropdownMenuTrigger>Open</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>Item</DropdownMenuItem></DropdownMenuContent></DropdownMenu>',
  livePreviewable: true,
  usageGuidelines: 'Use for action menus, user menus, or option lists.',
  accessibilityNotes: 'Fully keyboard navigable with arrow keys.',
  relatedComponents: ['shadcn-context-menu', 'shadcn-menubar'],
};

const alertDialogComponent: IndexedComponent = {
  id: 'shadcn-alert-dialog',
  name: 'Alert Dialog',
  library: shadcnLibrary,
  category: 'overlay',
  tags: ['modal', 'confirm', 'warning', 'destructive', 'popup'],
  description: 'Modal dialog for confirmations and alerts',
  importStatement:
    "import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'",
  code: `import React from 'react';

export default function App() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="p-4">
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-md hover:bg-red-600"
      >
        Delete Account
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/80" />
          <div className="relative z-50 w-full max-w-lg rounded-lg border bg-white p-6 shadow-lg">
            <div className="flex flex-col space-y-2 text-center sm:text-left">
              <h2 className="text-lg font-semibold">Are you absolutely sure?</h2>
              <p className="text-sm text-slate-500">
                This action cannot be undone. This will permanently delete your
                account and remove your data from our servers.
              </p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4">
              <button
                onClick={() => setOpen(false)}
                className="mt-2 sm:mt-0 px-4 py-2 border rounded-md text-sm font-medium hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-md hover:bg-red-600"
              >
                Yes, delete account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}`,
  props: [
    { name: 'open', type: 'boolean', required: false, description: 'Controlled open state' },
    {
      name: 'onOpenChange',
      type: '(open: boolean) => void',
      required: false,
      description: 'Open state change handler',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-alert-dialog'],
  previewCode:
    '<AlertDialog><AlertDialogTrigger>Open</AlertDialogTrigger><AlertDialogContent>...</AlertDialogContent></AlertDialog>',
  livePreviewable: true,
  usageGuidelines: 'Use for destructive actions requiring confirmation.',
  accessibilityNotes: 'Traps focus and requires explicit action.',
  relatedComponents: ['shadcn-dialog'],
};

const contextMenuComponent: IndexedComponent = {
  id: 'shadcn-context-menu',
  name: 'Context Menu',
  library: shadcnLibrary,
  category: 'overlay',
  tags: ['right-click', 'menu', 'actions', 'popup', 'context'],
  description: 'Right-click context menu',
  importStatement:
    "import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'",
  code: `import React from 'react';

export default function App() {
  const [show, setShow] = React.useState(false);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });

  const handleContextMenu = (e) => {
    e.preventDefault();
    setPosition({ x: e.clientX, y: e.clientY });
    setShow(true);
  };

  return (
    <div className="p-4">
      <div
        onContextMenu={handleContextMenu}
        className="flex h-[150px] w-[300px] items-center justify-center rounded-md border border-dashed text-sm"
      >
        Right click here
      </div>

      {show && (
        <div
          className="fixed z-50 w-64 rounded-md border bg-white shadow-md"
          style={{ left: position.x, top: position.y }}
          onMouseLeave={() => setShow(false)}
        >
          <div className="p-1">
            <button className="w-full flex items-center rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100">
              Back
            </button>
            <button className="w-full flex items-center rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100">
              Forward
            </button>
            <button className="w-full flex items-center rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100">
              Reload
            </button>
            <div className="h-px bg-slate-200 my-1" />
            <button className="w-full flex items-center rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100">
              View Page Source
            </button>
          </div>
        </div>
      )}
    </div>
  );
}`,
  props: [],
  variants: [],
  dependencies: ['@radix-ui/react-context-menu'],
  previewCode:
    '<ContextMenu><ContextMenuTrigger>Right click</ContextMenuTrigger><ContextMenuContent><ContextMenuItem>Item</ContextMenuItem></ContextMenuContent></ContextMenu>',
  livePreviewable: true,
  usageGuidelines: 'Use for right-click menus on interactive elements.',
  accessibilityNotes: 'Keyboard accessible via Shift+F10.',
  relatedComponents: ['shadcn-dropdown-menu'],
};

const hoverCardComponent: IndexedComponent = {
  id: 'shadcn-hover-card',
  name: 'Hover Card',
  library: shadcnLibrary,
  category: 'overlay',
  tags: ['preview', 'popup', 'tooltip', 'info', 'hover'],
  description: 'Preview card that appears on hover',
  importStatement:
    "import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'",
  code: `import React from 'react';

export default function App() {
  const [show, setShow] = React.useState(false);

  return (
    <div className="p-8 flex justify-center">
      <div className="relative inline-block">
        <a
          href="#"
          onMouseEnter={() => setShow(true)}
          onMouseLeave={() => setShow(false)}
          className="text-sm font-medium underline underline-offset-4"
        >
          @nextjs
        </a>

        {show && (
          <div className="absolute z-50 mt-2 w-80 rounded-md border bg-white p-4 shadow-md">
            <div className="flex justify-between space-x-4">
              <div className="h-12 w-12 rounded-full bg-slate-100" />
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">@nextjs</h4>
                <p className="text-sm text-slate-500">
                  The React Framework – created and maintained by @vercel.
                </p>
                <div className="flex items-center pt-2">
                  <svg className="mr-2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs text-slate-500">
                    Joined December 2021
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}`,
  props: [
    {
      name: 'openDelay',
      type: 'number',
      required: false,
      default: 700,
      description: 'Delay before showing (ms)',
    },
    {
      name: 'closeDelay',
      type: 'number',
      required: false,
      default: 300,
      description: 'Delay before hiding (ms)',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-hover-card'],
  previewCode:
    '<HoverCard><HoverCardTrigger>Hover</HoverCardTrigger><HoverCardContent>Preview</HoverCardContent></HoverCard>',
  livePreviewable: true,
  usageGuidelines: 'Use for user profiles, link previews, or quick info.',
  accessibilityNotes: 'Content is accessible via focus.',
  relatedComponents: ['shadcn-tooltip', 'shadcn-popover'],
};

const scrollAreaComponent: IndexedComponent = {
  id: 'shadcn-scroll-area',
  name: 'Scroll Area',
  library: shadcnLibrary,
  category: 'layout',
  tags: ['scrollbar', 'overflow', 'container', 'scroll', 'list'],
  description: 'Custom scrollbar area',
  importStatement: "import { ScrollArea } from '@/components/ui/scroll-area'",
  code: `import React from 'react';

export default function App() {
  const tags = Array.from({ length: 50 }).map((_, i) => \`v1.2.0-beta.\${i}\`);

  return (
    <div className="p-4">
      <div className="h-72 w-48 rounded-md border">
        <div className="p-4">
          <h4 className="mb-4 text-sm font-medium leading-none">Tags</h4>
          <div className="h-56 overflow-y-auto">
            {tags.map((tag) => (
              <div key={tag} className="text-sm py-1">
                {tag}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}`,
  props: [
    {
      name: 'orientation',
      type: '"vertical" | "horizontal" | "both"',
      required: false,
      default: 'vertical',
      description: 'Scroll orientation',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-scroll-area'],
  previewCode: '<ScrollArea className="h-[200px]"><div>...content...</div></ScrollArea>',
  livePreviewable: true,
  usageGuidelines: 'Use for custom-styled scrollable areas.',
  accessibilityNotes: 'Maintains native scroll behavior.',
  relatedComponents: [],
};

const aspectRatioComponent: IndexedComponent = {
  id: 'shadcn-aspect-ratio',
  name: 'Aspect Ratio',
  library: shadcnLibrary,
  category: 'layout',
  tags: ['image', 'video', 'ratio', 'container', 'responsive'],
  description: 'Container with fixed aspect ratio',
  importStatement: "import { AspectRatio } from '@/components/ui/aspect-ratio'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="w-[450px] p-4">
      <div className="relative" style={{ paddingBottom: '56.25%' }}>
        <img
          src="https://images.unsplash.com/photo-1588345921523-c2dcdb7f1dcd?w=800&dpr=2&q=80"
          alt="Photo"
          className="absolute inset-0 h-full w-full rounded-md object-cover"
        />
      </div>
    </div>
  );
}`,
  props: [
    {
      name: 'ratio',
      type: 'number',
      required: false,
      default: 1,
      description: 'Aspect ratio (width/height)',
    },
  ],
  variants: [
    {
      name: '16:9',
      props: { ratio: 16 / 9 },
      previewCode: '<AspectRatio ratio={16/9}><img /></AspectRatio>',
    },
    {
      name: '4:3',
      props: { ratio: 4 / 3 },
      previewCode: '<AspectRatio ratio={4/3}><img /></AspectRatio>',
    },
    {
      name: '1:1',
      props: { ratio: 1 },
      previewCode: '<AspectRatio ratio={1}><img /></AspectRatio>',
    },
  ],
  dependencies: ['@radix-ui/react-aspect-ratio'],
  previewCode: '<AspectRatio ratio={16/9}><img src="..." /></AspectRatio>',
  livePreviewable: true,
  usageGuidelines: 'Use for images, videos, or responsive containers.',
  accessibilityNotes: 'No specific accessibility concerns.',
  relatedComponents: [],
};

const collapsibleComponent: IndexedComponent = {
  id: 'shadcn-collapsible',
  name: 'Collapsible',
  library: shadcnLibrary,
  category: 'display',
  tags: ['expand', 'collapse', 'toggle', 'disclosure', 'panel'],
  description: 'Collapsible content section',
  importStatement:
    "import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'",
  code: `import React from 'react';

export default function App() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="w-[350px] p-4">
      <div className="flex items-center justify-between space-x-4 px-4">
        <h4 className="text-sm font-semibold">
          @peduarte starred 3 repositories
        </h4>
        <button
          onClick={() => setOpen(!open)}
          className="w-9 p-0 h-9 flex items-center justify-center rounded border hover:bg-slate-100"
        >
          <svg
            className={\`h-4 w-4 transition-transform \${open ? 'rotate-180' : ''}\`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      <div className="rounded-md border px-4 py-3 font-mono text-sm mt-2">
        @radix-ui/primitives
      </div>
      {open && (
        <div className="space-y-2 mt-2">
          <div className="rounded-md border px-4 py-3 font-mono text-sm">
            @radix-ui/colors
          </div>
          <div className="rounded-md border px-4 py-3 font-mono text-sm">
            @stitches/react
          </div>
        </div>
      )}
    </div>
  );
}`,
  props: [
    { name: 'open', type: 'boolean', required: false, description: 'Controlled open state' },
    {
      name: 'onOpenChange',
      type: '(open: boolean) => void',
      required: false,
      description: 'Open state change handler',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-collapsible'],
  previewCode:
    '<Collapsible><CollapsibleTrigger>Toggle</CollapsibleTrigger><CollapsibleContent>Content</CollapsibleContent></Collapsible>',
  livePreviewable: true,
  usageGuidelines: 'Use for expandable sections with a single toggle.',
  accessibilityNotes: 'Uses aria-expanded for screen readers.',
  relatedComponents: ['shadcn-accordion'],
};

const breadcrumbComponent: IndexedComponent = {
  id: 'shadcn-breadcrumb',
  name: 'Breadcrumb',
  library: shadcnLibrary,
  category: 'navigation',
  tags: ['navigation', 'path', 'hierarchy', 'links', 'trail'],
  description: 'Navigation breadcrumb trail',
  importStatement:
    "import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'",
  code: `import React from 'react';

export default function App() {
  return (
    <nav className="p-4" aria-label="Breadcrumb">
      <ol className="flex items-center gap-1.5 text-sm text-slate-500">
        <li className="inline-flex items-center">
          <a href="#" className="hover:text-slate-900">Home</a>
        </li>
        <li>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </li>
        <li className="inline-flex items-center">
          <a href="#" className="hover:text-slate-900">Components</a>
        </li>
        <li>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </li>
        <li className="inline-flex items-center font-medium text-slate-900">
          Breadcrumb
        </li>
      </ol>
    </nav>
  );
}`,
  props: [],
  variants: [],
  dependencies: [],
  previewCode:
    '<Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>Current</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>',
  livePreviewable: true,
  usageGuidelines: 'Use for showing navigation hierarchy.',
  accessibilityNotes: 'Uses aria-label="Breadcrumb" for screen readers.',
  relatedComponents: ['shadcn-navigation-menu'],
};

const tableComponent: IndexedComponent = {
  id: 'shadcn-table',
  name: 'Table',
  library: shadcnLibrary,
  category: 'display',
  tags: ['data', 'grid', 'list', 'rows', 'columns'],
  description: 'Data table with header and rows',
  importStatement:
    "import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'",
  code: `import React from 'react';

export default function App() {
  const invoices = [
    { invoice: 'INV001', status: 'Paid', method: 'Credit Card', amount: '$250.00' },
    { invoice: 'INV002', status: 'Pending', method: 'PayPal', amount: '$150.00' },
    { invoice: 'INV003', status: 'Unpaid', method: 'Bank Transfer', amount: '$350.00' },
  ];

  return (
    <div className="p-4">
      <table className="w-full caption-bottom text-sm">
        <thead className="border-b">
          <tr>
            <th className="h-12 px-4 text-left align-middle font-medium text-slate-500">Invoice</th>
            <th className="h-12 px-4 text-left align-middle font-medium text-slate-500">Status</th>
            <th className="h-12 px-4 text-left align-middle font-medium text-slate-500">Method</th>
            <th className="h-12 px-4 text-right align-middle font-medium text-slate-500">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.invoice} className="border-b hover:bg-slate-50">
              <td className="p-4 align-middle font-medium">{invoice.invoice}</td>
              <td className="p-4 align-middle">{invoice.status}</td>
              <td className="p-4 align-middle">{invoice.method}</td>
              <td className="p-4 align-middle text-right">{invoice.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}`,
  props: [],
  variants: [],
  dependencies: [],
  previewCode:
    '<Table><TableHeader><TableRow><TableHead>Header</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Cell</TableCell></TableRow></TableBody></Table>',
  livePreviewable: true,
  usageGuidelines: 'Use for displaying tabular data.',
  accessibilityNotes: 'Uses semantic table elements.',
  relatedComponents: [],
};

const commandComponent: IndexedComponent = {
  id: 'shadcn-command',
  name: 'Command',
  library: shadcnLibrary,
  category: 'input',
  tags: ['search', 'palette', 'combobox', 'autocomplete', 'filter'],
  description: 'Command palette / search input with suggestions',
  importStatement:
    "import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'",
  code: `import React from 'react';

export default function App() {
  const [search, setSearch] = React.useState('');

  const suggestions = [
    { group: 'Suggestions', items: ['Calendar', 'Search Emoji', 'Calculator'] },
    { group: 'Settings', items: ['Profile', 'Billing', 'Settings'] },
  ];

  return (
    <div className="p-4">
      <div className="w-[400px] rounded-lg border shadow-md">
        <div className="flex items-center border-b px-3">
          <svg className="mr-2 h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type a command or search..."
            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-slate-500"
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto p-1">
          {suggestions.map((group) => (
            <div key={group.group}>
              <div className="px-2 py-1.5 text-xs font-medium text-slate-500">{group.group}</div>
              {group.items
                .filter((item) => item.toLowerCase().includes(search.toLowerCase()))
                .map((item) => (
                  <div
                    key={item}
                    className="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100"
                  >
                    {item}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}`,
  props: [],
  variants: [],
  dependencies: ['cmdk'],
  previewCode:
    '<Command><CommandInput placeholder="Search..." /><CommandList><CommandEmpty>No results.</CommandEmpty><CommandGroup><CommandItem>Item</CommandItem></CommandGroup></CommandList></Command>',
  livePreviewable: true,
  usageGuidelines: 'Use for command palettes, search, or comboboxes.',
  accessibilityNotes: 'Fully keyboard navigable.',
  relatedComponents: ['shadcn-select', 'shadcn-popover'],
};

const navigationMenuComponent: IndexedComponent = {
  id: 'shadcn-navigation-menu',
  name: 'Navigation Menu',
  library: shadcnLibrary,
  category: 'navigation',
  tags: ['nav', 'menu', 'header', 'links', 'dropdown'],
  description: 'Navigation menu with dropdowns',
  importStatement:
    "import { NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger } from '@/components/ui/navigation-menu'",
  code: `import React from 'react';

export default function App() {
  const [activeMenu, setActiveMenu] = React.useState(null);

  return (
    <nav className="p-4">
      <ul className="flex items-center gap-6">
        <li
          className="relative"
          onMouseEnter={() => setActiveMenu('getting-started')}
          onMouseLeave={() => setActiveMenu(null)}
        >
          <button className="group inline-flex h-10 items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100">
            Getting started
            <svg className="ml-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {activeMenu === 'getting-started' && (
            <div className="absolute left-0 top-full w-[400px] rounded-md border bg-white p-4 shadow-lg">
              <ul className="grid gap-3">
                <li>
                  <a href="#" className="block rounded-md p-3 hover:bg-slate-100">
                    <div className="font-medium">Introduction</div>
                    <p className="text-sm text-slate-500">Get started with the basics.</p>
                  </a>
                </li>
                <li>
                  <a href="#" className="block rounded-md p-3 hover:bg-slate-100">
                    <div className="font-medium">Installation</div>
                    <p className="text-sm text-slate-500">How to install and configure.</p>
                  </a>
                </li>
              </ul>
            </div>
          )}
        </li>
        <li>
          <a href="#" className="inline-flex h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-100">
            Documentation
          </a>
        </li>
      </ul>
    </nav>
  );
}`,
  props: [],
  variants: [],
  dependencies: ['@radix-ui/react-navigation-menu'],
  previewCode:
    '<NavigationMenu><NavigationMenuList><NavigationMenuItem><NavigationMenuTrigger>Item</NavigationMenuTrigger><NavigationMenuContent>Content</NavigationMenuContent></NavigationMenuItem></NavigationMenuList></NavigationMenu>',
  livePreviewable: true,
  usageGuidelines: 'Use for main site navigation with dropdowns.',
  accessibilityNotes: 'Fully keyboard navigable.',
  relatedComponents: ['shadcn-dropdown-menu', 'shadcn-menubar'],
};

const menubarComponent: IndexedComponent = {
  id: 'shadcn-menubar',
  name: 'Menubar',
  library: shadcnLibrary,
  category: 'navigation',
  tags: ['menu', 'toolbar', 'actions', 'app', 'desktop'],
  description: 'Application menubar (File, Edit, View)',
  importStatement:
    "import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarSeparator, MenubarShortcut, MenubarTrigger } from '@/components/ui/menubar'",
  code: `import React from 'react';

export default function App() {
  const [activeMenu, setActiveMenu] = React.useState(null);

  return (
    <div className="p-4">
      <div className="flex h-10 items-center space-x-1 rounded-md border bg-white p-1">
        {['File', 'Edit', 'View'].map((menu) => (
          <div
            key={menu}
            className="relative"
            onMouseEnter={() => setActiveMenu(menu)}
            onMouseLeave={() => setActiveMenu(null)}
          >
            <button className="flex items-center rounded-sm px-3 py-1.5 text-sm font-medium hover:bg-slate-100">
              {menu}
            </button>
            {activeMenu === menu && (
              <div className="absolute left-0 top-full z-50 w-48 rounded-md border bg-white p-1 shadow-md">
                <button className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100">
                  New Tab <span className="text-xs text-slate-500">⌘T</span>
                </button>
                <button className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100">
                  New Window <span className="text-xs text-slate-500">⌘N</span>
                </button>
                <div className="h-px bg-slate-200 my-1" />
                <button className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100">
                  Print...
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}`,
  props: [],
  variants: [],
  dependencies: ['@radix-ui/react-menubar'],
  previewCode:
    '<Menubar><MenubarMenu><MenubarTrigger>File</MenubarTrigger><MenubarContent><MenubarItem>New</MenubarItem></MenubarContent></MenubarMenu></Menubar>',
  livePreviewable: true,
  usageGuidelines: 'Use for desktop-style application menus.',
  accessibilityNotes: 'Fully keyboard navigable.',
  relatedComponents: ['shadcn-dropdown-menu', 'shadcn-navigation-menu'],
};

const resizableComponent: IndexedComponent = {
  id: 'shadcn-resizable',
  name: 'Resizable',
  library: shadcnLibrary,
  category: 'layout',
  tags: ['resize', 'panel', 'split', 'drag', 'layout'],
  description: 'Resizable panel groups',
  importStatement:
    "import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="h-[200px] w-full max-w-md rounded-lg border p-4">
      <div className="flex h-full">
        <div className="flex-1 flex items-center justify-center bg-slate-50 rounded-l-lg">
          <span className="font-semibold">Sidebar</span>
        </div>
        <div className="w-2 bg-slate-200 cursor-col-resize flex items-center justify-center">
          <div className="h-4 w-1 rounded-full bg-slate-400" />
        </div>
        <div className="flex-[2] flex items-center justify-center bg-slate-50 rounded-r-lg">
          <span className="font-semibold">Content</span>
        </div>
      </div>
    </div>
  );
}`,
  props: [
    {
      name: 'direction',
      type: '"horizontal" | "vertical"',
      required: false,
      default: 'horizontal',
      description: 'Resize direction',
    },
  ],
  variants: [],
  dependencies: ['react-resizable-panels'],
  previewCode:
    '<ResizablePanelGroup direction="horizontal"><ResizablePanel>One</ResizablePanel><ResizableHandle /><ResizablePanel>Two</ResizablePanel></ResizablePanelGroup>',
  livePreviewable: true,
  usageGuidelines: 'Use for resizable layouts like sidebars.',
  accessibilityNotes: 'Keyboard accessible via arrow keys.',
  relatedComponents: [],
};

const paginationComponent: IndexedComponent = {
  id: 'shadcn-pagination',
  name: 'Pagination',
  library: shadcnLibrary,
  category: 'navigation',
  tags: ['pages', 'navigation', 'list', 'data', 'controls'],
  description: 'Pagination controls for lists',
  importStatement:
    "import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination'",
  code: `import React from 'react';

export default function App() {
  const [page, setPage] = React.useState(2);

  return (
    <nav className="p-4" role="navigation" aria-label="pagination">
      <ul className="flex flex-row items-center gap-1">
        <li>
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            className="inline-flex items-center justify-center h-10 px-4 py-2 gap-1 text-sm font-medium hover:bg-slate-100 rounded-md"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </button>
        </li>
        {[1, 2, 3].map((p) => (
          <li key={p}>
            <button
              onClick={() => setPage(p)}
              className={\`inline-flex items-center justify-center h-10 w-10 text-sm font-medium rounded-md \${page === p ? 'border bg-white' : 'hover:bg-slate-100'}\`}
            >
              {p}
            </button>
          </li>
        ))}
        <li>
          <span className="flex h-9 w-9 items-center justify-center">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle cx="4" cy="12" r="1" fill="currentColor" />
              <circle cx="12" cy="12" r="1" fill="currentColor" />
              <circle cx="20" cy="12" r="1" fill="currentColor" />
            </svg>
          </span>
        </li>
        <li>
          <button
            onClick={() => setPage(Math.min(10, page + 1))}
            className="inline-flex items-center justify-center h-10 px-4 py-2 gap-1 text-sm font-medium hover:bg-slate-100 rounded-md"
          >
            Next
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </li>
      </ul>
    </nav>
  );
}`,
  props: [],
  variants: [],
  dependencies: [],
  previewCode:
    '<Pagination><PaginationContent><PaginationItem><PaginationPrevious /></PaginationItem><PaginationItem><PaginationLink>1</PaginationLink></PaginationItem><PaginationItem><PaginationNext /></PaginationItem></PaginationContent></Pagination>',
  livePreviewable: true,
  usageGuidelines: 'Use for paginated lists or tables.',
  accessibilityNotes: 'Uses aria-label for navigation.',
  relatedComponents: ['shadcn-table'],
};

const toastComponent: IndexedComponent = {
  id: 'shadcn-toast',
  name: 'Toast',
  library: shadcnLibrary,
  category: 'feedback',
  tags: ['notification', 'message', 'alert', 'snackbar', 'popup'],
  description: 'Toast notification messages',
  importStatement: "import { useToast, Toast, ToastAction } from '@/components/ui/toast'",
  code: `import React from 'react';

export default function App() {
  const [toasts, setToasts] = React.useState([]);

  const showToast = () => {
    const id = Date.now();
    setToasts([...toasts, { id, title: 'Scheduled!', description: 'Your event has been scheduled.' }]);
    setTimeout(() => {
      setToasts((t) => t.filter((toast) => toast.id !== id));
    }, 3000);
  };

  return (
    <div className="p-4">
      <button
        onClick={showToast}
        className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800"
      >
        Show Toast
      </button>

      <div className="fixed bottom-4 right-4 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div key={toast.id} className="w-[360px] rounded-md border bg-white p-4 shadow-lg">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="text-sm font-semibold">{toast.title}</div>
                <div className="text-sm text-slate-500">{toast.description}</div>
              </div>
              <button
                onClick={() => setToasts(toasts.filter((t) => t.id !== toast.id))}
                className="text-slate-400 hover:text-slate-900"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}`,
  props: [
    {
      name: 'variant',
      type: '"default" | "destructive"',
      required: false,
      default: 'default',
      description: 'Toast style variant',
    },
  ],
  variants: [
    { name: 'default', props: {}, previewCode: 'toast({ title: "Success" })' },
    {
      name: 'destructive',
      props: { variant: 'destructive' },
      previewCode: 'toast({ variant: "destructive", title: "Error" })',
    },
  ],
  dependencies: ['@radix-ui/react-toast'],
  previewCode: 'toast({ title: "Success!", description: "Your changes have been saved." })',
  livePreviewable: true,
  usageGuidelines: 'Use for temporary notifications.',
  accessibilityNotes: 'Uses role="status" for screen readers.',
  relatedComponents: ['shadcn-alert', 'shadcn-sonner'],
};

const sonnerComponent: IndexedComponent = {
  id: 'shadcn-sonner',
  name: 'Sonner',
  library: shadcnLibrary,
  category: 'feedback',
  tags: ['toast', 'notification', 'message', 'alert', 'snackbar'],
  description: 'Opinionated toast component',
  importStatement: "import { toast } from 'sonner'",
  code: `import React from 'react';

export default function App() {
  const [toasts, setToasts] = React.useState([]);

  const showToast = (type) => {
    const id = Date.now();
    const messages = {
      default: { title: 'Event created', description: 'Monday, January 3rd at 6:00pm' },
      success: { title: 'Success!', description: 'Your changes have been saved.' },
      error: { title: 'Error', description: 'Something went wrong.' },
    };
    setToasts([...toasts, { id, type, ...messages[type] }]);
    setTimeout(() => setToasts((t) => t.filter((toast) => toast.id !== id)), 3000);
  };

  return (
    <div className="p-4 space-x-2">
      <button onClick={() => showToast('default')} className="px-4 py-2 border rounded-md text-sm">Default</button>
      <button onClick={() => showToast('success')} className="px-4 py-2 border rounded-md text-sm">Success</button>
      <button onClick={() => showToast('error')} className="px-4 py-2 border rounded-md text-sm">Error</button>

      <div className="fixed bottom-4 right-4 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={\`w-[360px] rounded-md border p-4 shadow-lg \${
              toast.type === 'success' ? 'bg-green-50 border-green-200' :
              toast.type === 'error' ? 'bg-red-50 border-red-200' : 'bg-white'
            }\`}
          >
            <div className="text-sm font-semibold">{toast.title}</div>
            <div className="text-sm text-slate-500">{toast.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}`,
  props: [],
  variants: [],
  dependencies: ['sonner'],
  previewCode: 'toast("Event has been created")',
  livePreviewable: true,
  usageGuidelines: 'Alternative to shadcn toast with simpler API.',
  accessibilityNotes: 'Handles accessibility automatically.',
  relatedComponents: ['shadcn-toast'],
};

const drawerComponent: IndexedComponent = {
  id: 'shadcn-drawer',
  name: 'Drawer',
  library: shadcnLibrary,
  category: 'overlay',
  tags: ['modal', 'bottom-sheet', 'panel', 'mobile', 'slide'],
  description: 'Bottom sheet drawer for mobile',
  importStatement:
    "import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'",
  code: `import React from 'react';

export default function App() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="p-4">
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800"
      >
        Open Drawer
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black/80" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border bg-white">
            <div className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-slate-200" />
            <div className="p-4">
              <h2 className="text-lg font-semibold">Move Goal</h2>
              <p className="text-sm text-slate-500 mt-1">
                Set your daily activity goal.
              </p>
              <div className="mt-4 flex justify-center">
                <div className="text-5xl font-bold">350</div>
              </div>
              <p className="text-center text-sm text-slate-500 mt-2">
                calories/day
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="flex-1 px-4 py-2 border rounded-md text-sm"
                >
                  Cancel
                </button>
                <button className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-md text-sm">
                  Submit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}`,
  props: [
    { name: 'open', type: 'boolean', required: false, description: 'Controlled open state' },
    {
      name: 'onOpenChange',
      type: '(open: boolean) => void',
      required: false,
      description: 'Open state change handler',
    },
  ],
  variants: [],
  dependencies: ['vaul'],
  previewCode:
    '<Drawer><DrawerTrigger>Open</DrawerTrigger><DrawerContent>Content</DrawerContent></Drawer>',
  livePreviewable: true,
  usageGuidelines: 'Use for mobile bottom sheets and drawers.',
  accessibilityNotes: 'Handles touch gestures and keyboard.',
  relatedComponents: ['shadcn-sheet', 'shadcn-dialog'],
};

const carouselComponent: IndexedComponent = {
  id: 'shadcn-carousel',
  name: 'Carousel',
  library: shadcnLibrary,
  category: 'display',
  tags: ['slider', 'gallery', 'images', 'scroll', 'swipe'],
  description: 'Image/content carousel slider',
  importStatement:
    "import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel'",
  code: `import React from 'react';

export default function App() {
  const [current, setCurrent] = React.useState(0);
  const items = [1, 2, 3, 4, 5];

  return (
    <div className="w-full max-w-xs mx-auto p-4">
      <div className="relative">
        <div className="overflow-hidden rounded-lg">
          <div
            className="flex transition-transform duration-300"
            style={{ transform: \`translateX(-\${current * 100}%)\` }}
          >
            {items.map((item) => (
              <div key={item} className="flex-none w-full">
                <div className="p-1">
                  <div className="flex aspect-square items-center justify-center rounded-lg border bg-slate-50">
                    <span className="text-3xl font-semibold">{item}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <button
          onClick={() => setCurrent(Math.max(0, current - 1))}
          className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full border bg-white shadow flex items-center justify-center hover:bg-slate-100"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => setCurrent(Math.min(items.length - 1, current + 1))}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full border bg-white shadow flex items-center justify-center hover:bg-slate-100"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      <div className="py-2 text-center text-sm text-slate-500">
        Slide {current + 1} of {items.length}
      </div>
    </div>
  );
}`,
  props: [
    {
      name: 'orientation',
      type: '"horizontal" | "vertical"',
      required: false,
      default: 'horizontal',
      description: 'Carousel orientation',
    },
    { name: 'opts', type: 'object', required: false, description: 'Embla carousel options' },
  ],
  variants: [],
  dependencies: ['embla-carousel-react'],
  previewCode:
    '<Carousel><CarouselContent><CarouselItem>Slide</CarouselItem></CarouselContent><CarouselPrevious /><CarouselNext /></Carousel>',
  livePreviewable: true,
  usageGuidelines: 'Use for image galleries or content sliders.',
  accessibilityNotes: 'Keyboard navigable with arrow keys.',
  relatedComponents: [],
};

const calendarComponent: IndexedComponent = {
  id: 'shadcn-calendar',
  name: 'Calendar',
  library: shadcnLibrary,
  category: 'input',
  tags: ['date', 'picker', 'datepicker', 'schedule', 'time'],
  description: 'Date picker calendar',
  importStatement: "import { Calendar } from '@/components/ui/calendar'",
  code: `import React from 'react';

export default function App() {
  const [date, setDate] = React.useState(new Date());
  const [currentMonth, setCurrentMonth] = React.useState(new Date());

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const padding = Array.from({ length: firstDayOfMonth }, (_, i) => null);

  return (
    <div className="p-4">
      <div className="w-[280px] rounded-md border p-3">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-100"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-sm font-medium">
            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-100"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500 mb-2">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
            <div key={day} className="h-8 flex items-center justify-center">{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {padding.map((_, i) => <div key={\`pad-\${i}\`} className="h-8" />)}
          {days.map((day) => {
            const isSelected = date.getDate() === day && date.getMonth() === currentMonth.getMonth() && date.getFullYear() === currentMonth.getFullYear();
            return (
              <button
                key={day}
                onClick={() => setDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day))}
                className={\`h-8 w-8 rounded text-sm \${isSelected ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}\`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}`,
  props: [
    {
      name: 'mode',
      type: '"single" | "multiple" | "range"',
      required: false,
      default: 'single',
      description: 'Selection mode',
    },
    {
      name: 'selected',
      type: 'Date | Date[] | DateRange',
      required: false,
      description: 'Selected date(s)',
    },
    {
      name: 'onSelect',
      type: '(date: Date) => void',
      required: false,
      description: 'Selection handler',
    },
  ],
  variants: [],
  dependencies: ['react-day-picker'],
  previewCode: '<Calendar mode="single" selected={date} onSelect={setDate} />',
  livePreviewable: true,
  usageGuidelines: 'Use for date selection in forms.',
  accessibilityNotes: 'Fully keyboard navigable.',
  relatedComponents: ['shadcn-popover'],
};

const inputOTPComponent: IndexedComponent = {
  id: 'shadcn-input-otp',
  name: 'Input OTP',
  library: shadcnLibrary,
  category: 'input',
  tags: ['verification', 'code', 'pin', 'authentication', 'sms'],
  description: 'One-time password input',
  importStatement:
    "import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp'",
  code: `import React from 'react';

export default function App() {
  const [value, setValue] = React.useState('');
  const inputs = [0, 1, 2, 3, 4, 5];

  const handleChange = (index, char) => {
    const newValue = value.split('');
    newValue[index] = char;
    setValue(newValue.join(''));

    if (char && index < 5) {
      const nextInput = document.getElementById(\`otp-\${index + 1}\`);
      nextInput?.focus();
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center gap-2">
        <div className="flex gap-2">
          {inputs.slice(0, 3).map((i) => (
            <input
              key={i}
              id={\`otp-\${i}\`}
              type="text"
              maxLength={1}
              value={value[i] || ''}
              onChange={(e) => handleChange(i, e.target.value)}
              className="h-10 w-10 rounded-md border text-center text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          ))}
        </div>
        <div className="text-slate-300">-</div>
        <div className="flex gap-2">
          {inputs.slice(3).map((i) => (
            <input
              key={i}
              id={\`otp-\${i}\`}
              type="text"
              maxLength={1}
              value={value[i] || ''}
              onChange={(e) => handleChange(i, e.target.value)}
              className="h-10 w-10 rounded-md border text-center text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          ))}
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-500">
        Enter your one-time password.
      </p>
    </div>
  );
}`,
  props: [
    { name: 'maxLength', type: 'number', required: true, description: 'Number of OTP digits' },
    { name: 'value', type: 'string', required: false, description: 'Controlled value' },
    {
      name: 'onChange',
      type: '(value: string) => void',
      required: false,
      description: 'Value change handler',
    },
  ],
  variants: [],
  dependencies: ['input-otp'],
  previewCode:
    '<InputOTP maxLength={6}><InputOTPGroup><InputOTPSlot index={0} />...</InputOTPGroup></InputOTP>',
  livePreviewable: true,
  usageGuidelines: 'Use for verification codes and 2FA.',
  accessibilityNotes: 'Auto-focuses next input on entry.',
  relatedComponents: ['shadcn-input'],
};

export const shadcnComponents: IndexedComponent[] = [
  buttonComponent,
  cardComponent,
  inputComponent,
  badgeComponent,
  avatarComponent,
  switchComponent,
  checkboxComponent,
  selectComponent,
  dialogComponent,
  alertComponent,
  progressComponent,
  tabsComponent,
  tooltipComponent,
  separatorComponent,
  skeletonComponent,
  labelComponent,
  textareaComponent,
  sliderComponent,
  radioGroupComponent,
  toggleComponent,
  toggleGroupComponent,
  accordionComponent,
  sheetComponent,
  popoverComponent,
  dropdownMenuComponent,
  alertDialogComponent,
  contextMenuComponent,
  hoverCardComponent,
  scrollAreaComponent,
  aspectRatioComponent,
  collapsibleComponent,
  breadcrumbComponent,
  tableComponent,
  commandComponent,
  navigationMenuComponent,
  menubarComponent,
  resizableComponent,
  paginationComponent,
  toastComponent,
  sonnerComponent,
  drawerComponent,
  carouselComponent,
  calendarComponent,
  inputOTPComponent,
];

export const shadcnIndex: LibraryIndex = {
  library: shadcnLibrary,
  components: shadcnComponents,
  lastUpdated: new Date().toISOString(),
  schemaVersion: LIBRARY_SCHEMA_VERSION,
};

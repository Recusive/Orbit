/**
 * Radix UI Primitives Index
 * Pre-indexed unstyled, accessible components
 */

import { LIBRARY_INFO, LIBRARY_SCHEMA_VERSION } from '../components/componentLibraryTypes';

import type { LibraryIndex, IndexedComponent } from '../components/componentLibraryTypes';

const radixLibrary = LIBRARY_INFO['radix'];
if (radixLibrary === undefined) throw new Error('radix library config missing from LIBRARY_INFO');

const accordionComponent: IndexedComponent = {
  id: 'radix-accordion',
  name: 'Accordion',
  library: radixLibrary,
  category: 'display',
  tags: ['collapsible', 'expandable', 'faq', 'disclosure', 'panel'],
  description: 'Vertically stacked set of interactive headings that reveal content',
  importStatement: "import * as Accordion from '@radix-ui/react-accordion'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="w-[300px] rounded-md bg-white shadow-md">
      <div className="border-b">
        <button className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium hover:bg-slate-50">
          <span>Is it accessible?</span>
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
        </button>
        <div className="px-4 pb-3 text-sm text-slate-600">
          Yes. It adheres to the WAI-ARIA design pattern.
        </div>
      </div>
      <div className="border-b">
        <button className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium hover:bg-slate-50">
          <span>Is it styled?</span>
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
        </button>
      </div>
    </div>
  );
}`,
  props: [
    {
      name: 'type',
      type: '"single" | "multiple"',
      required: true,
      description: 'Allow single or multiple items open',
    },
    { name: 'value', type: 'string | string[]', required: false, description: 'Controlled value' },
    {
      name: 'defaultValue',
      type: 'string | string[]',
      required: false,
      description: 'Default open items',
    },
    {
      name: 'collapsible',
      type: 'boolean',
      required: false,
      default: false,
      description: 'Allow closing all items',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-accordion'],
  previewCode:
    '<Accordion.Root type="single"><Accordion.Item value="item-1"><Accordion.Trigger>Item</Accordion.Trigger><Accordion.Content>Content</Accordion.Content></Accordion.Item></Accordion.Root>',
  livePreviewable: true,
  usageGuidelines: 'Use for FAQs, settings panels, or any collapsible content sections.',
  accessibilityNotes: 'Full keyboard navigation. Uses aria-expanded and aria-controls.',
  relatedComponents: ['radix-collapsible', 'radix-tabs'],
};

const alertDialogComponent: IndexedComponent = {
  id: 'radix-alert-dialog',
  name: 'AlertDialog',
  library: radixLibrary,
  category: 'overlay',
  tags: ['modal', 'confirm', 'warning', 'destructive', 'popup'],
  description: 'Modal dialog for important confirmations that interrupt user workflow',
  importStatement: "import * as AlertDialog from '@radix-ui/react-alert-dialog'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="flex items-center justify-center p-8">
      <button className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600">
        Delete Account
      </button>
      {/* Dialog would appear on click */}
      <div className="hidden fixed inset-0 bg-black/50 flex items-center justify-center">
        <div className="bg-white rounded-lg p-6 max-w-md shadow-xl">
          <h2 className="text-lg font-semibold">Are you sure?</h2>
          <p className="mt-2 text-sm text-slate-600">This action cannot be undone.</p>
          <div className="mt-4 flex justify-end gap-2">
            <button className="px-4 py-2 text-sm rounded-md hover:bg-slate-100">Cancel</button>
            <button className="px-4 py-2 text-sm bg-red-500 text-white rounded-md hover:bg-red-600">Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}`,
  props: [
    { name: 'open', type: 'boolean', required: false, description: 'Controlled open state' },
    { name: 'defaultOpen', type: 'boolean', required: false, description: 'Initial open state' },
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
    '<AlertDialog.Root><AlertDialog.Trigger>Open</AlertDialog.Trigger><AlertDialog.Portal><AlertDialog.Overlay /><AlertDialog.Content>...</AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>',
  livePreviewable: true,
  usageGuidelines:
    'Use for destructive actions requiring confirmation. Requires user action to dismiss.',
  accessibilityNotes: 'Focus trapped. Escape to cancel. Announces as alertdialog role.',
  relatedComponents: ['radix-dialog'],
};

const avatarComponent: IndexedComponent = {
  id: 'radix-avatar',
  name: 'Avatar',
  library: radixLibrary,
  category: 'display',
  tags: ['user', 'profile', 'image', 'initials', 'picture'],
  description: 'Image element with fallback for user avatars',
  importStatement: "import * as Avatar from '@radix-ui/react-avatar'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="flex gap-4 p-4">
      <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-200">
        <img
          src="https://github.com/radix-ui.png"
          alt="Avatar"
          className="w-full h-full object-cover"
        />
      </div>
      <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-white font-medium">
        JD
      </div>
    </div>
  );
}`,
  props: [],
  variants: [],
  dependencies: ['@radix-ui/react-avatar'],
  previewCode:
    '<Avatar.Root><Avatar.Image src="..." /><Avatar.Fallback>JD</Avatar.Fallback></Avatar.Root>',
  livePreviewable: true,
  usageGuidelines: 'Use for user profile images. Always provide fallback for failed loads.',
  accessibilityNotes: 'Image alt text required. Fallback shown while loading or on error.',
  relatedComponents: [],
};

const checkboxComponent: IndexedComponent = {
  id: 'radix-checkbox',
  name: 'Checkbox',
  library: radixLibrary,
  category: 'input',
  tags: ['form', 'toggle', 'boolean', 'checked', 'tick'],
  description: 'Control for boolean input with indeterminate state support',
  importStatement: "import * as Checkbox from '@radix-ui/react-checkbox'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="flex items-center gap-2 p-4">
      <button
        className="w-5 h-5 rounded border-2 border-slate-300 flex items-center justify-center hover:border-slate-400 data-[state=checked]:bg-slate-900 data-[state=checked]:border-slate-900"
        data-state="checked"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" className="text-white">
          <path d="M2 6l3 3 5-6" fill="none" stroke="currentColor" strokeWidth="2"/>
        </svg>
      </button>
      <label className="text-sm">Accept terms and conditions</label>
    </div>
  );
}`,
  props: [
    {
      name: 'checked',
      type: 'boolean | "indeterminate"',
      required: false,
      description: 'Controlled checked state',
    },
    {
      name: 'defaultChecked',
      type: 'boolean',
      required: false,
      description: 'Initial checked state',
    },
    {
      name: 'onCheckedChange',
      type: '(checked: boolean | "indeterminate") => void',
      required: false,
      description: 'Checked change handler',
    },
    { name: 'disabled', type: 'boolean', required: false, description: 'Disable the checkbox' },
    { name: 'required', type: 'boolean', required: false, description: 'Mark as required' },
    { name: 'name', type: 'string', required: false, description: 'Form field name' },
    {
      name: 'value',
      type: 'string',
      required: false,
      default: 'on',
      description: 'Form field value',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-checkbox'],
  previewCode:
    '<Checkbox.Root><Checkbox.Indicator><CheckIcon /></Checkbox.Indicator></Checkbox.Root>',
  livePreviewable: true,
  usageGuidelines: 'Use for boolean choices. Support indeterminate for partial selections.',
  accessibilityNotes: 'Native checkbox accessibility. Space to toggle.',
  relatedComponents: ['radix-switch', 'radix-radio-group'],
};

const collapsibleComponent: IndexedComponent = {
  id: 'radix-collapsible',
  name: 'Collapsible',
  library: radixLibrary,
  category: 'display',
  tags: ['expand', 'collapse', 'toggle', 'disclosure', 'hidden'],
  description: 'Interactive component which expands/collapses a panel',
  importStatement: "import * as Collapsible from '@radix-ui/react-collapsible'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="w-[300px] p-4">
      <button className="flex w-full items-center justify-between rounded-md bg-slate-100 px-4 py-2 text-sm font-medium hover:bg-slate-200">
        <span>Show more</span>
        <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
      </button>
      <div className="mt-2 rounded-md bg-slate-50 p-4 text-sm">
        Additional content that was hidden.
      </div>
    </div>
  );
}`,
  props: [
    { name: 'open', type: 'boolean', required: false, description: 'Controlled open state' },
    { name: 'defaultOpen', type: 'boolean', required: false, description: 'Initial open state' },
    {
      name: 'onOpenChange',
      type: '(open: boolean) => void',
      required: false,
      description: 'Open change handler',
    },
    { name: 'disabled', type: 'boolean', required: false, description: 'Disable toggling' },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-collapsible'],
  previewCode:
    '<Collapsible.Root><Collapsible.Trigger>Toggle</Collapsible.Trigger><Collapsible.Content>Content</Collapsible.Content></Collapsible.Root>',
  livePreviewable: true,
  usageGuidelines: 'Use for show/hide content. For multiple sections, use Accordion instead.',
  accessibilityNotes: 'Uses aria-expanded. Keyboard accessible.',
  relatedComponents: ['radix-accordion'],
};

const contextMenuComponent: IndexedComponent = {
  id: 'radix-context-menu',
  name: 'ContextMenu',
  library: radixLibrary,
  category: 'overlay',
  tags: ['right-click', 'popup', 'actions', 'menu', 'options'],
  description: 'Menu activated by right-click or long-press',
  importStatement: "import * as ContextMenu from '@radix-ui/react-context-menu'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-8">
      <div className="w-64 h-32 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-sm text-slate-500">
        Right-click here
      </div>
      {/* Context menu would appear on right-click */}
      <div className="hidden mt-4 w-48 rounded-md bg-white shadow-lg border p-1">
        <button className="w-full px-3 py-2 text-left text-sm rounded hover:bg-slate-100">Edit</button>
        <button className="w-full px-3 py-2 text-left text-sm rounded hover:bg-slate-100">Duplicate</button>
        <div className="my-1 h-px bg-slate-200" />
        <button className="w-full px-3 py-2 text-left text-sm rounded text-red-600 hover:bg-red-50">Delete</button>
      </div>
    </div>
  );
}`,
  props: [
    {
      name: 'onOpenChange',
      type: '(open: boolean) => void',
      required: false,
      description: 'Open change handler',
    },
    {
      name: 'modal',
      type: 'boolean',
      required: false,
      default: true,
      description: 'Modal behavior',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-context-menu'],
  previewCode:
    '<ContextMenu.Root><ContextMenu.Trigger>Right-click</ContextMenu.Trigger><ContextMenu.Portal><ContextMenu.Content>...</ContextMenu.Content></ContextMenu.Portal></ContextMenu.Root>',
  livePreviewable: true,
  usageGuidelines: 'Use for contextual actions. Provide keyboard alternatives.',
  accessibilityNotes: 'Full keyboard navigation. Arrow keys to navigate items.',
  relatedComponents: ['radix-dropdown-menu'],
};

const dialogComponent: IndexedComponent = {
  id: 'radix-dialog',
  name: 'Dialog',
  library: radixLibrary,
  category: 'overlay',
  tags: ['modal', 'popup', 'window', 'overlay', 'lightbox'],
  description: 'Modal dialog overlay that requires interaction',
  importStatement: "import * as Dialog from '@radix-ui/react-dialog'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-8">
      <button className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800">
        Open Dialog
      </button>
      {/* Dialog would appear on click */}
      <div className="hidden fixed inset-0 bg-black/50 flex items-center justify-center">
        <div className="bg-white rounded-lg p-6 max-w-md shadow-xl">
          <h2 className="text-lg font-semibold">Edit Profile</h2>
          <p className="mt-2 text-sm text-slate-600">Make changes to your profile here.</p>
          <div className="mt-4">
            <input className="w-full px-3 py-2 border rounded-md" placeholder="Name" />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="px-4 py-2 text-sm rounded-md hover:bg-slate-100">Cancel</button>
            <button className="px-4 py-2 text-sm bg-slate-900 text-white rounded-md hover:bg-slate-800">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}`,
  props: [
    { name: 'open', type: 'boolean', required: false, description: 'Controlled open state' },
    { name: 'defaultOpen', type: 'boolean', required: false, description: 'Initial open state' },
    {
      name: 'onOpenChange',
      type: '(open: boolean) => void',
      required: false,
      description: 'Open change handler',
    },
    {
      name: 'modal',
      type: 'boolean',
      required: false,
      default: true,
      description: 'Modal behavior',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-dialog'],
  previewCode:
    '<Dialog.Root><Dialog.Trigger>Open</Dialog.Trigger><Dialog.Portal><Dialog.Overlay /><Dialog.Content><Dialog.Title>Title</Dialog.Title><Dialog.Description>Desc</Dialog.Description></Dialog.Content></Dialog.Portal></Dialog.Root>',
  livePreviewable: true,
  usageGuidelines: 'Use for focused tasks. Include close button and escape to dismiss.',
  accessibilityNotes: 'Focus trapped. Announces as dialog role. Escape to close.',
  relatedComponents: ['radix-alert-dialog'],
};

const dropdownMenuComponent: IndexedComponent = {
  id: 'radix-dropdown-menu',
  name: 'DropdownMenu',
  library: radixLibrary,
  category: 'overlay',
  tags: ['menu', 'popup', 'actions', 'select', 'options'],
  description: 'Menu for displaying a list of actions or options',
  importStatement: "import * as DropdownMenu from '@radix-ui/react-dropdown-menu'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-8">
      <button className="px-4 py-2 bg-slate-100 rounded-md hover:bg-slate-200 flex items-center gap-2">
        Options
        <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
      </button>
      {/* Dropdown would appear on click */}
      <div className="mt-2 w-48 rounded-md bg-white shadow-lg border p-1">
        <button className="w-full px-3 py-2 text-left text-sm rounded hover:bg-slate-100">New Tab</button>
        <button className="w-full px-3 py-2 text-left text-sm rounded hover:bg-slate-100">New Window</button>
        <div className="my-1 h-px bg-slate-200" />
        <button className="w-full px-3 py-2 text-left text-sm rounded hover:bg-slate-100">Settings</button>
      </div>
    </div>
  );
}`,
  props: [
    { name: 'open', type: 'boolean', required: false, description: 'Controlled open state' },
    { name: 'defaultOpen', type: 'boolean', required: false, description: 'Initial open state' },
    {
      name: 'onOpenChange',
      type: '(open: boolean) => void',
      required: false,
      description: 'Open change handler',
    },
    {
      name: 'modal',
      type: 'boolean',
      required: false,
      default: true,
      description: 'Modal behavior',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-dropdown-menu'],
  previewCode:
    '<DropdownMenu.Root><DropdownMenu.Trigger>Menu</DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content>...</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>',
  livePreviewable: true,
  usageGuidelines: 'Use for action menus. Support checkboxes and radio items for selections.',
  accessibilityNotes: 'Full keyboard navigation. Type-ahead selection.',
  relatedComponents: ['radix-context-menu', 'radix-menubar'],
};

const hoverCardComponent: IndexedComponent = {
  id: 'radix-hover-card',
  name: 'HoverCard',
  library: radixLibrary,
  category: 'overlay',
  tags: ['tooltip', 'preview', 'hover', 'popup', 'info'],
  description: 'Card that appears on hover for sighted users',
  importStatement: "import * as HoverCard from '@radix-ui/react-hover-card'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-8">
      <a href="#" className="text-blue-600 hover:underline">@radix_ui</a>
      {/* HoverCard would appear on hover */}
      <div className="mt-2 w-64 rounded-md bg-white shadow-lg border p-4">
        <div className="flex gap-3">
          <div className="w-12 h-12 rounded-full bg-slate-200" />
          <div>
            <p className="font-semibold text-sm">Radix UI</p>
            <p className="text-xs text-slate-500">@radix_ui</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Unstyled, accessible components for React.
        </p>
      </div>
    </div>
  );
}`,
  props: [
    { name: 'open', type: 'boolean', required: false, description: 'Controlled open state' },
    { name: 'defaultOpen', type: 'boolean', required: false, description: 'Initial open state' },
    {
      name: 'onOpenChange',
      type: '(open: boolean) => void',
      required: false,
      description: 'Open change handler',
    },
    {
      name: 'openDelay',
      type: 'number',
      required: false,
      default: 700,
      description: 'Delay before opening',
    },
    {
      name: 'closeDelay',
      type: 'number',
      required: false,
      default: 300,
      description: 'Delay before closing',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-hover-card'],
  previewCode:
    '<HoverCard.Root><HoverCard.Trigger>Hover me</HoverCard.Trigger><HoverCard.Portal><HoverCard.Content>Preview</HoverCard.Content></HoverCard.Portal></HoverCard.Root>',
  livePreviewable: true,
  usageGuidelines:
    'Use for rich previews on hover. Not for critical info (not accessible to keyboard).',
  accessibilityNotes: 'Hover-only - provide alternative access to content.',
  relatedComponents: ['radix-tooltip', 'radix-popover'],
};

const labelComponent: IndexedComponent = {
  id: 'radix-label',
  name: 'Label',
  library: radixLibrary,
  category: 'input',
  tags: ['form', 'text', 'accessibility', 'input', 'field'],
  description: 'Accessible label for form controls',
  importStatement: "import * as Label from '@radix-ui/react-label'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-4 space-y-2">
      <label className="text-sm font-medium text-slate-900" htmlFor="email">
        Email address
      </label>
      <input
        id="email"
        type="email"
        className="w-full px-3 py-2 border rounded-md"
        placeholder="you@example.com"
      />
    </div>
  );
}`,
  props: [
    {
      name: 'htmlFor',
      type: 'string',
      required: false,
      description: 'ID of the associated control',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-label'],
  previewCode: '<Label.Root htmlFor="input">Label</Label.Root>',
  livePreviewable: true,
  usageGuidelines: 'Always pair with form controls. Clicking focuses the associated input.',
  accessibilityNotes: 'Associates with control via htmlFor. Click to focus.',
  relatedComponents: [],
};

const menubarComponent: IndexedComponent = {
  id: 'radix-menubar',
  name: 'Menubar',
  library: radixLibrary,
  category: 'navigation',
  tags: ['menu', 'navigation', 'toolbar', 'app', 'desktop'],
  description: 'Horizontal menu bar like in desktop applications',
  importStatement: "import * as Menubar from '@radix-ui/react-menubar'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-4">
      <div className="flex bg-slate-100 rounded-md p-1">
        <button className="px-3 py-1.5 text-sm rounded hover:bg-white">File</button>
        <button className="px-3 py-1.5 text-sm rounded hover:bg-white">Edit</button>
        <button className="px-3 py-1.5 text-sm rounded hover:bg-white">View</button>
        <button className="px-3 py-1.5 text-sm rounded hover:bg-white">Help</button>
      </div>
    </div>
  );
}`,
  props: [
    {
      name: 'loop',
      type: 'boolean',
      required: false,
      default: true,
      description: 'Loop keyboard navigation',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-menubar'],
  previewCode:
    '<Menubar.Root><Menubar.Menu><Menubar.Trigger>File</Menubar.Trigger><Menubar.Portal><Menubar.Content>...</Menubar.Content></Menubar.Portal></Menubar.Menu></Menubar.Root>',
  livePreviewable: true,
  usageGuidelines: 'Use for application-style menu bars. Support submenus and keyboard shortcuts.',
  accessibilityNotes: 'Full keyboard navigation. Left/right arrows between menus.',
  relatedComponents: ['radix-dropdown-menu'],
};

const navigationMenuComponent: IndexedComponent = {
  id: 'radix-navigation-menu',
  name: 'NavigationMenu',
  library: radixLibrary,
  category: 'navigation',
  tags: ['nav', 'links', 'menu', 'header', 'mega-menu'],
  description: 'Collection of navigation links with dropdown support',
  importStatement: "import * as NavigationMenu from '@radix-ui/react-navigation-menu'",
  code: `import React from 'react';

export default function App() {
  return (
    <nav className="p-4">
      <ul className="flex gap-4">
        <li>
          <button className="px-3 py-2 text-sm font-medium hover:text-slate-600">Products</button>
        </li>
        <li>
          <button className="px-3 py-2 text-sm font-medium hover:text-slate-600">Resources</button>
        </li>
        <li>
          <a href="#" className="px-3 py-2 text-sm font-medium hover:text-slate-600">Pricing</a>
        </li>
      </ul>
    </nav>
  );
}`,
  props: [
    { name: 'value', type: 'string', required: false, description: 'Controlled active menu' },
    { name: 'defaultValue', type: 'string', required: false, description: 'Default active menu' },
    {
      name: 'onValueChange',
      type: '(value: string) => void',
      required: false,
      description: 'Value change handler',
    },
    {
      name: 'orientation',
      type: '"horizontal" | "vertical"',
      required: false,
      default: 'horizontal',
      description: 'Menu orientation',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-navigation-menu'],
  previewCode:
    '<NavigationMenu.Root><NavigationMenu.List><NavigationMenu.Item>...</NavigationMenu.Item></NavigationMenu.List></NavigationMenu.Root>',
  livePreviewable: true,
  usageGuidelines: 'Use for site navigation. Support mega-menu style dropdowns.',
  accessibilityNotes: 'Semantic nav element. Keyboard accessible.',
  relatedComponents: ['radix-menubar'],
};

const popoverComponent: IndexedComponent = {
  id: 'radix-popover',
  name: 'Popover',
  library: radixLibrary,
  category: 'overlay',
  tags: ['popup', 'dropdown', 'floating', 'tooltip', 'info'],
  description: 'Floating content panel anchored to a trigger',
  importStatement: "import * as Popover from '@radix-ui/react-popover'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-8">
      <button className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center">
        i
      </button>
      {/* Popover would appear on click */}
      <div className="mt-2 w-64 rounded-md bg-white shadow-lg border p-4">
        <h3 className="font-semibold text-sm">Dimensions</h3>
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs w-16">Width</label>
            <input className="flex-1 px-2 py-1 border rounded text-sm" defaultValue="100%" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs w-16">Height</label>
            <input className="flex-1 px-2 py-1 border rounded text-sm" defaultValue="auto" />
          </div>
        </div>
      </div>
    </div>
  );
}`,
  props: [
    { name: 'open', type: 'boolean', required: false, description: 'Controlled open state' },
    { name: 'defaultOpen', type: 'boolean', required: false, description: 'Initial open state' },
    {
      name: 'onOpenChange',
      type: '(open: boolean) => void',
      required: false,
      description: 'Open change handler',
    },
    {
      name: 'modal',
      type: 'boolean',
      required: false,
      default: false,
      description: 'Modal behavior',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-popover'],
  previewCode:
    '<Popover.Root><Popover.Trigger>Open</Popover.Trigger><Popover.Portal><Popover.Content>Content</Popover.Content></Popover.Portal></Popover.Root>',
  livePreviewable: true,
  usageGuidelines: 'Use for rich interactive content. For simple text, use Tooltip.',
  accessibilityNotes: 'Focus moves to content. Escape to close.',
  relatedComponents: ['radix-tooltip', 'radix-hover-card'],
};

const progressComponent: IndexedComponent = {
  id: 'radix-progress',
  name: 'Progress',
  library: radixLibrary,
  category: 'feedback',
  tags: ['loading', 'percentage', 'bar', 'completion', 'status'],
  description: 'Displays completion progress of a task',
  importStatement: "import * as Progress from '@radix-ui/react-progress'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-4 w-64">
      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
        <div className="h-full bg-slate-900 w-2/3 transition-all" />
      </div>
      <p className="mt-2 text-sm text-slate-600">66% complete</p>
    </div>
  );
}`,
  props: [
    {
      name: 'value',
      type: 'number | null',
      required: false,
      description: 'Current progress (0-max)',
    },
    { name: 'max', type: 'number', required: false, default: 100, description: 'Maximum value' },
    {
      name: 'getValueLabel',
      type: '(value: number, max: number) => string',
      required: false,
      description: 'Accessible value label',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-progress'],
  previewCode:
    '<Progress.Root value={66}><Progress.Indicator style={{width: "66%"}} /></Progress.Root>',
  livePreviewable: true,
  usageGuidelines: 'Use for determinate progress. Use null value for indeterminate state.',
  accessibilityNotes: 'Announces progress changes. Uses progressbar role.',
  relatedComponents: [],
};

const radioGroupComponent: IndexedComponent = {
  id: 'radix-radio-group',
  name: 'RadioGroup',
  library: radixLibrary,
  category: 'input',
  tags: ['form', 'select', 'options', 'choice', 'single'],
  description: 'Set of checkable buttons where only one can be checked',
  importStatement: "import * as RadioGroup from '@radix-ui/react-radio-group'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center gap-2">
        <button className="w-4 h-4 rounded-full border-2 border-slate-900 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-slate-900" />
        </button>
        <label className="text-sm">Default</label>
      </div>
      <div className="flex items-center gap-2">
        <button className="w-4 h-4 rounded-full border-2 border-slate-300" />
        <label className="text-sm">Comfortable</label>
      </div>
      <div className="flex items-center gap-2">
        <button className="w-4 h-4 rounded-full border-2 border-slate-300" />
        <label className="text-sm">Compact</label>
      </div>
    </div>
  );
}`,
  props: [
    { name: 'value', type: 'string', required: false, description: 'Controlled value' },
    { name: 'defaultValue', type: 'string', required: false, description: 'Initial value' },
    {
      name: 'onValueChange',
      type: '(value: string) => void',
      required: false,
      description: 'Value change handler',
    },
    { name: 'disabled', type: 'boolean', required: false, description: 'Disable all items' },
    { name: 'required', type: 'boolean', required: false, description: 'Mark as required' },
    {
      name: 'orientation',
      type: '"horizontal" | "vertical"',
      required: false,
      default: 'vertical',
      description: 'Layout orientation',
    },
    {
      name: 'loop',
      type: 'boolean',
      required: false,
      default: true,
      description: 'Loop keyboard navigation',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-radio-group'],
  previewCode:
    '<RadioGroup.Root><RadioGroup.Item value="1"><RadioGroup.Indicator /></RadioGroup.Item></RadioGroup.Root>',
  livePreviewable: true,
  usageGuidelines: 'Use for single selection from a list. For many options, use Select.',
  accessibilityNotes: 'Arrow keys to navigate. Native radio group behavior.',
  relatedComponents: ['radix-checkbox', 'radix-select'],
};

const scrollAreaComponent: IndexedComponent = {
  id: 'radix-scroll-area',
  name: 'ScrollArea',
  library: radixLibrary,
  category: 'layout',
  tags: ['overflow', 'scrollbar', 'container', 'list', 'custom'],
  description: 'Custom styled scrollable area',
  importStatement: "import * as ScrollArea from '@radix-ui/react-scroll-area'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="w-48 h-48 rounded-md border">
      <div className="p-4">
        <h4 className="text-sm font-medium mb-2">Tags</h4>
        {['React', 'TypeScript', 'Node.js', 'GraphQL', 'Docker', 'Kubernetes', 'AWS', 'PostgreSQL'].map(tag => (
          <div key={tag} className="py-2 border-b last:border-0 text-sm">
            {tag}
          </div>
        ))}
      </div>
    </div>
  );
}`,
  props: [
    {
      name: 'type',
      type: '"auto" | "always" | "scroll" | "hover"',
      required: false,
      default: 'hover',
      description: 'Scrollbar visibility',
    },
    {
      name: 'scrollHideDelay',
      type: 'number',
      required: false,
      default: 600,
      description: 'Hide delay in ms',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-scroll-area'],
  previewCode:
    '<ScrollArea.Root><ScrollArea.Viewport>Content</ScrollArea.Viewport><ScrollArea.Scrollbar><ScrollArea.Thumb /></ScrollArea.Scrollbar></ScrollArea.Root>',
  livePreviewable: true,
  usageGuidelines: 'Use for custom scrollbar styling. Maintains native scroll behavior.',
  accessibilityNotes: 'Native scroll behavior preserved.',
  relatedComponents: [],
};

const selectComponent: IndexedComponent = {
  id: 'radix-select',
  name: 'Select',
  library: radixLibrary,
  category: 'input',
  tags: ['form', 'dropdown', 'picker', 'options', 'choice'],
  description: 'Displays a list of options for selection',
  importStatement: "import * as Select from '@radix-ui/react-select'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-4">
      <button className="w-48 px-3 py-2 border rounded-md flex items-center justify-between text-sm">
        <span>Select a fruit...</span>
        <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
      </button>
      {/* Options would appear on click */}
      <div className="mt-2 w-48 rounded-md bg-white shadow-lg border p-1">
        <div className="px-3 py-2 text-xs text-slate-500">Fruits</div>
        <button className="w-full px-3 py-2 text-left text-sm rounded hover:bg-slate-100">Apple</button>
        <button className="w-full px-3 py-2 text-left text-sm rounded hover:bg-slate-100">Banana</button>
        <button className="w-full px-3 py-2 text-left text-sm rounded hover:bg-slate-100">Orange</button>
      </div>
    </div>
  );
}`,
  props: [
    { name: 'value', type: 'string', required: false, description: 'Controlled value' },
    { name: 'defaultValue', type: 'string', required: false, description: 'Initial value' },
    {
      name: 'onValueChange',
      type: '(value: string) => void',
      required: false,
      description: 'Value change handler',
    },
    { name: 'open', type: 'boolean', required: false, description: 'Controlled open state' },
    { name: 'defaultOpen', type: 'boolean', required: false, description: 'Initial open state' },
    {
      name: 'onOpenChange',
      type: '(open: boolean) => void',
      required: false,
      description: 'Open change handler',
    },
    { name: 'disabled', type: 'boolean', required: false, description: 'Disable the select' },
    { name: 'required', type: 'boolean', required: false, description: 'Mark as required' },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-select'],
  previewCode:
    '<Select.Root><Select.Trigger><Select.Value placeholder="Select..." /></Select.Trigger><Select.Portal><Select.Content>...</Select.Content></Select.Portal></Select.Root>',
  livePreviewable: true,
  usageGuidelines: 'Use for single selection from many options. Support groups for organization.',
  accessibilityNotes: 'Full keyboard navigation. Type-ahead selection.',
  relatedComponents: ['radix-radio-group'],
};

const separatorComponent: IndexedComponent = {
  id: 'radix-separator',
  name: 'Separator',
  library: radixLibrary,
  category: 'layout',
  tags: ['divider', 'line', 'hr', 'split', 'border'],
  description: 'Visually or semantically separates content',
  importStatement: "import * as Separator from '@radix-ui/react-separator'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-4">
      <div className="text-sm font-medium">Radix Primitives</div>
      <p className="text-sm text-slate-600">An open-source UI component library.</p>
      <div className="my-4 h-px bg-slate-200" />
      <div className="flex h-5 items-center gap-4 text-sm">
        <span>Blog</span>
        <div className="w-px h-full bg-slate-200" />
        <span>Docs</span>
        <div className="w-px h-full bg-slate-200" />
        <span>Source</span>
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
    {
      name: 'decorative',
      type: 'boolean',
      required: false,
      description: 'If true, not announced by screen readers',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-separator'],
  previewCode: '<Separator.Root />',
  livePreviewable: true,
  usageGuidelines:
    'Use to visually divide content. Set decorative=true for purely visual separators.',
  accessibilityNotes: 'Uses separator role unless decorative.',
  relatedComponents: [],
};

const sliderComponent: IndexedComponent = {
  id: 'radix-slider',
  name: 'Slider',
  library: radixLibrary,
  category: 'input',
  tags: ['range', 'input', 'volume', 'number', 'control'],
  description: 'Input for selecting values from a range',
  importStatement: "import * as Slider from '@radix-ui/react-slider'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-4 w-64">
      <div className="relative flex items-center h-5">
        <div className="h-1 w-full bg-slate-200 rounded-full">
          <div className="h-full w-1/2 bg-slate-900 rounded-full" />
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-2 border-slate-900 rounded-full shadow" />
      </div>
    </div>
  );
}`,
  props: [
    { name: 'value', type: 'number[]', required: false, description: 'Controlled value' },
    { name: 'defaultValue', type: 'number[]', required: false, description: 'Initial value' },
    {
      name: 'onValueChange',
      type: '(value: number[]) => void',
      required: false,
      description: 'Value change handler',
    },
    {
      name: 'onValueCommit',
      type: '(value: number[]) => void',
      required: false,
      description: 'Called on drag end',
    },
    { name: 'min', type: 'number', required: false, default: 0, description: 'Minimum value' },
    { name: 'max', type: 'number', required: false, default: 100, description: 'Maximum value' },
    { name: 'step', type: 'number', required: false, default: 1, description: 'Step increment' },
    { name: 'disabled', type: 'boolean', required: false, description: 'Disable the slider' },
    {
      name: 'orientation',
      type: '"horizontal" | "vertical"',
      required: false,
      default: 'horizontal',
      description: 'Slider orientation',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-slider'],
  previewCode:
    '<Slider.Root><Slider.Track><Slider.Range /></Slider.Track><Slider.Thumb /></Slider.Root>',
  livePreviewable: true,
  usageGuidelines: 'Use for numeric range input. Support multiple thumbs for range selection.',
  accessibilityNotes: 'Arrow keys to adjust. Announces value changes.',
  relatedComponents: ['radix-progress'],
};

const switchComponent: IndexedComponent = {
  id: 'radix-switch',
  name: 'Switch',
  library: radixLibrary,
  category: 'input',
  tags: ['toggle', 'boolean', 'on-off', 'settings', 'preference'],
  description: 'Toggle control for boolean settings',
  importStatement: "import * as Switch from '@radix-ui/react-switch'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="flex items-center gap-2 p-4">
      <button
        className="w-11 h-6 bg-slate-900 rounded-full relative transition-colors"
        data-state="checked"
      >
        <span className="block w-5 h-5 bg-white rounded-full shadow translate-x-5 transition-transform" />
      </button>
      <label className="text-sm">Airplane Mode</label>
    </div>
  );
}`,
  props: [
    { name: 'checked', type: 'boolean', required: false, description: 'Controlled checked state' },
    {
      name: 'defaultChecked',
      type: 'boolean',
      required: false,
      description: 'Initial checked state',
    },
    {
      name: 'onCheckedChange',
      type: '(checked: boolean) => void',
      required: false,
      description: 'Checked change handler',
    },
    { name: 'disabled', type: 'boolean', required: false, description: 'Disable the switch' },
    { name: 'required', type: 'boolean', required: false, description: 'Mark as required' },
    { name: 'name', type: 'string', required: false, description: 'Form field name' },
    {
      name: 'value',
      type: 'string',
      required: false,
      default: 'on',
      description: 'Form field value',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-switch'],
  previewCode: '<Switch.Root><Switch.Thumb /></Switch.Root>',
  livePreviewable: true,
  usageGuidelines: 'Use for on/off settings with immediate effect. For forms, consider Checkbox.',
  accessibilityNotes: 'Space to toggle. Announces as switch role.',
  relatedComponents: ['radix-checkbox', 'radix-toggle'],
};

const tabsComponent: IndexedComponent = {
  id: 'radix-tabs',
  name: 'Tabs',
  library: radixLibrary,
  category: 'navigation',
  tags: ['navigation', 'panels', 'sections', 'tabbed', 'content'],
  description: 'Set of layered content sections shown one at a time',
  importStatement: "import * as Tabs from '@radix-ui/react-tabs'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="w-[400px]">
      <div className="flex border-b">
        <button className="px-4 py-2 text-sm font-medium border-b-2 border-slate-900">Account</button>
        <button className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">Password</button>
      </div>
      <div className="p-4">
        <h3 className="font-medium text-sm">Account</h3>
        <p className="mt-2 text-sm text-slate-600">
          Make changes to your account here. Click save when you're done.
        </p>
      </div>
    </div>
  );
}`,
  props: [
    { name: 'value', type: 'string', required: false, description: 'Controlled active tab' },
    { name: 'defaultValue', type: 'string', required: false, description: 'Initial active tab' },
    {
      name: 'onValueChange',
      type: '(value: string) => void',
      required: false,
      description: 'Value change handler',
    },
    {
      name: 'orientation',
      type: '"horizontal" | "vertical"',
      required: false,
      default: 'horizontal',
      description: 'Tab orientation',
    },
    {
      name: 'activationMode',
      type: '"automatic" | "manual"',
      required: false,
      default: 'automatic',
      description: 'Tab activation mode',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-tabs'],
  previewCode:
    '<Tabs.Root defaultValue="tab1"><Tabs.List><Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger></Tabs.List><Tabs.Content value="tab1">Content</Tabs.Content></Tabs.Root>',
  livePreviewable: true,
  usageGuidelines: 'Use for content that can be logically grouped. Keep tab count manageable.',
  accessibilityNotes: 'Arrow keys to navigate tabs. Tab to enter content.',
  relatedComponents: ['radix-accordion'],
};

const toastComponent: IndexedComponent = {
  id: 'radix-toast',
  name: 'Toast',
  library: radixLibrary,
  category: 'feedback',
  tags: ['notification', 'alert', 'message', 'snackbar', 'popup'],
  description: 'Succinct message that appears temporarily',
  importStatement: "import * as Toast from '@radix-ui/react-toast'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-4">
      <button className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 text-sm">
        Add to calendar
      </button>
      {/* Toast would appear after action */}
      <div className="mt-4 bg-white border rounded-lg shadow-lg p-4 flex items-center justify-between w-80">
        <div>
          <p className="font-medium text-sm">Scheduled: Catch up</p>
          <p className="text-xs text-slate-500">Friday, February 10, 2023 at 5:57 PM</p>
        </div>
        <button className="text-xs text-blue-600 hover:underline">Undo</button>
      </div>
    </div>
  );
}`,
  props: [
    { name: 'open', type: 'boolean', required: false, description: 'Controlled open state' },
    {
      name: 'defaultOpen',
      type: 'boolean',
      required: false,
      default: true,
      description: 'Initial open state',
    },
    {
      name: 'onOpenChange',
      type: '(open: boolean) => void',
      required: false,
      description: 'Open change handler',
    },
    {
      name: 'duration',
      type: 'number',
      required: false,
      default: 5000,
      description: 'Auto-close duration',
    },
    {
      name: 'type',
      type: '"foreground" | "background"',
      required: false,
      default: 'foreground',
      description: 'Toast priority',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-toast'],
  previewCode:
    '<Toast.Provider><Toast.Root><Toast.Title>Title</Toast.Title><Toast.Description>Description</Toast.Description></Toast.Root><Toast.Viewport /></Toast.Provider>',
  livePreviewable: true,
  usageGuidelines: 'Use for non-critical feedback. Include action to undo when applicable.',
  accessibilityNotes: 'Announced by screen readers. Persists on hover.',
  relatedComponents: [],
};

const toggleComponent: IndexedComponent = {
  id: 'radix-toggle',
  name: 'Toggle',
  library: radixLibrary,
  category: 'input',
  tags: ['button', 'pressed', 'state', 'active', 'toolbar'],
  description: 'Two-state button that can be on or off',
  importStatement: "import * as Toggle from '@radix-ui/react-toggle'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="flex gap-2 p-4">
      <button className="w-10 h-10 rounded-md bg-slate-900 text-white flex items-center justify-center">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M2 4h12v1H2V4zm0 3h12v1H2V7zm0 3h8v1H2v-1z"/>
        </svg>
      </button>
      <button className="w-10 h-10 rounded-md hover:bg-slate-100 flex items-center justify-center">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 4h8v1H4V4zm2 3h4v1H6V7zm1 3h2v1H7v-1z"/>
        </svg>
      </button>
    </div>
  );
}`,
  props: [
    { name: 'pressed', type: 'boolean', required: false, description: 'Controlled pressed state' },
    {
      name: 'defaultPressed',
      type: 'boolean',
      required: false,
      description: 'Initial pressed state',
    },
    {
      name: 'onPressedChange',
      type: '(pressed: boolean) => void',
      required: false,
      description: 'Pressed change handler',
    },
    { name: 'disabled', type: 'boolean', required: false, description: 'Disable the toggle' },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-toggle'],
  previewCode: '<Toggle.Root>Toggle</Toggle.Root>',
  livePreviewable: true,
  usageGuidelines: 'Use for toolbar buttons that have pressed/unpressed states.',
  accessibilityNotes: 'Uses aria-pressed. Space/Enter to toggle.',
  relatedComponents: ['radix-toggle-group'],
};

const toggleGroupComponent: IndexedComponent = {
  id: 'radix-toggle-group',
  name: 'ToggleGroup',
  library: radixLibrary,
  category: 'input',
  tags: ['buttons', 'group', 'select', 'toolbar', 'options'],
  description: 'Group of toggle buttons with single or multiple selection',
  importStatement: "import * as ToggleGroup from '@radix-ui/react-toggle-group'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-4">
      <div className="inline-flex bg-slate-100 rounded-md p-1">
        <button className="px-3 py-1.5 text-sm rounded bg-white shadow">Left</button>
        <button className="px-3 py-1.5 text-sm rounded hover:bg-white/50">Center</button>
        <button className="px-3 py-1.5 text-sm rounded hover:bg-white/50">Right</button>
      </div>
    </div>
  );
}`,
  props: [
    { name: 'type', type: '"single" | "multiple"', required: true, description: 'Selection mode' },
    { name: 'value', type: 'string | string[]', required: false, description: 'Controlled value' },
    {
      name: 'defaultValue',
      type: 'string | string[]',
      required: false,
      description: 'Initial value',
    },
    {
      name: 'onValueChange',
      type: '(value: string | string[]) => void',
      required: false,
      description: 'Value change handler',
    },
    { name: 'disabled', type: 'boolean', required: false, description: 'Disable all items' },
    {
      name: 'orientation',
      type: '"horizontal" | "vertical"',
      required: false,
      default: 'horizontal',
      description: 'Layout orientation',
    },
    {
      name: 'loop',
      type: 'boolean',
      required: false,
      default: true,
      description: 'Loop keyboard navigation',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-toggle-group'],
  previewCode:
    '<ToggleGroup.Root type="single"><ToggleGroup.Item value="a">A</ToggleGroup.Item><ToggleGroup.Item value="b">B</ToggleGroup.Item></ToggleGroup.Root>',
  livePreviewable: true,
  usageGuidelines: 'Use for toolbar button groups. Type "single" for exclusive selection.',
  accessibilityNotes: 'Arrow keys to navigate. Roving tabindex.',
  relatedComponents: ['radix-toggle', 'radix-radio-group'],
};

const toolbarComponent: IndexedComponent = {
  id: 'radix-toolbar',
  name: 'Toolbar',
  library: radixLibrary,
  category: 'navigation',
  tags: ['actions', 'buttons', 'menu', 'controls', 'editor'],
  description: 'Container for grouping related action buttons',
  importStatement: "import * as Toolbar from '@radix-ui/react-toolbar'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-4">
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
        <button className="w-8 h-8 rounded flex items-center justify-center hover:bg-white">
          <svg width="16" height="16" fill="currentColor"><path d="M2 3h12v2H2V3zm0 4h12v2H2V7zm0 4h8v2H2v-2z"/></svg>
        </button>
        <button className="w-8 h-8 rounded flex items-center justify-center hover:bg-white">
          <svg width="16" height="16" fill="currentColor"><path d="M3 3h10v2H3V3zm2 4h6v2H5V7zm2 4h2v2H7v-2z"/></svg>
        </button>
        <div className="w-px h-6 bg-slate-300 mx-1" />
        <button className="w-8 h-8 rounded flex items-center justify-center hover:bg-white font-bold text-sm">B</button>
        <button className="w-8 h-8 rounded flex items-center justify-center hover:bg-white italic text-sm">I</button>
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
      description: 'Toolbar orientation',
    },
    {
      name: 'loop',
      type: 'boolean',
      required: false,
      default: true,
      description: 'Loop keyboard navigation',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-toolbar'],
  previewCode:
    '<Toolbar.Root><Toolbar.Button>Action</Toolbar.Button><Toolbar.Separator /><Toolbar.ToggleGroup type="single">...</Toolbar.ToggleGroup></Toolbar.Root>',
  livePreviewable: true,
  usageGuidelines: 'Use for editor toolbars or action bars. Group related buttons with separators.',
  accessibilityNotes: 'Roving tabindex. Arrow keys to navigate.',
  relatedComponents: ['radix-toggle-group'],
};

const tooltipComponent: IndexedComponent = {
  id: 'radix-tooltip',
  name: 'Tooltip',
  library: radixLibrary,
  category: 'overlay',
  tags: ['hint', 'info', 'hover', 'help', 'popup'],
  description: 'Popup that displays information on hover',
  importStatement: "import * as Tooltip from '@radix-ui/react-tooltip'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-8">
      <button className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center text-lg">
        +
      </button>
      {/* Tooltip would appear on hover */}
      <div className="mt-2 px-3 py-1.5 bg-slate-900 text-white text-xs rounded shadow-lg">
        Add to library
      </div>
    </div>
  );
}`,
  props: [
    { name: 'open', type: 'boolean', required: false, description: 'Controlled open state' },
    { name: 'defaultOpen', type: 'boolean', required: false, description: 'Initial open state' },
    {
      name: 'onOpenChange',
      type: '(open: boolean) => void',
      required: false,
      description: 'Open change handler',
    },
    {
      name: 'delayDuration',
      type: 'number',
      required: false,
      default: 700,
      description: 'Delay before showing',
    },
    {
      name: 'skipDelayDuration',
      type: 'number',
      required: false,
      default: 300,
      description: 'Skip delay when moving between tooltips',
    },
    {
      name: 'disableHoverableContent',
      type: 'boolean',
      required: false,
      description: 'Disable hovering tooltip content',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-tooltip'],
  previewCode:
    '<Tooltip.Provider><Tooltip.Root><Tooltip.Trigger>Hover</Tooltip.Trigger><Tooltip.Portal><Tooltip.Content>Tooltip</Tooltip.Content></Tooltip.Portal></Tooltip.Root></Tooltip.Provider>',
  livePreviewable: true,
  usageGuidelines: 'Use for brief helper text. For rich content, use HoverCard or Popover.',
  accessibilityNotes: 'Keyboard accessible via focus. Announced by screen readers.',
  relatedComponents: ['radix-hover-card', 'radix-popover'],
};

const aspectRatioComponent: IndexedComponent = {
  id: 'radix-aspect-ratio',
  name: 'AspectRatio',
  library: radixLibrary,
  category: 'layout',
  tags: ['ratio', 'image', 'video', 'responsive', 'container'],
  description: 'Displays content within a desired ratio',
  importStatement: "import * as AspectRatio from '@radix-ui/react-aspect-ratio'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="w-64 p-4">
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
        <img
          src="https://images.unsplash.com/photo-1535025183041-0991a977e25b?w=300"
          alt="Landscape"
          className="absolute inset-0 w-full h-full object-cover rounded-md"
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
      description: 'Desired aspect ratio (width/height)',
    },
  ],
  variants: [],
  dependencies: ['@radix-ui/react-aspect-ratio'],
  previewCode: '<AspectRatio.Root ratio={16/9}><img src="..." /></AspectRatio.Root>',
  livePreviewable: true,
  usageGuidelines: 'Use for images, videos, or any content that needs consistent aspect ratio.',
  accessibilityNotes: 'No specific accessibility concerns.',
  relatedComponents: [],
};

export const radixComponents: IndexedComponent[] = [
  accordionComponent,
  alertDialogComponent,
  aspectRatioComponent,
  avatarComponent,
  checkboxComponent,
  collapsibleComponent,
  contextMenuComponent,
  dialogComponent,
  dropdownMenuComponent,
  hoverCardComponent,
  labelComponent,
  menubarComponent,
  navigationMenuComponent,
  popoverComponent,
  progressComponent,
  radioGroupComponent,
  scrollAreaComponent,
  selectComponent,
  separatorComponent,
  sliderComponent,
  switchComponent,
  tabsComponent,
  toastComponent,
  toggleComponent,
  toggleGroupComponent,
  toolbarComponent,
  tooltipComponent,
];

export const radixIndex: LibraryIndex = {
  library: radixLibrary,
  components: radixComponents,
  lastUpdated: new Date().toISOString(),
  schemaVersion: LIBRARY_SCHEMA_VERSION,
};

/**
 * Headless UI Component Index
 * Pre-indexed unstyled, accessible components from Tailwind Labs
 */

import { LIBRARY_INFO, LIBRARY_SCHEMA_VERSION } from '../components/componentLibraryTypes';

import type {
  LibraryIndex,
  IndexedComponent,
  LibraryInfo,
} from '../components/componentLibraryTypes';

// Headless UI library info (not yet in LIBRARY_INFO, will be added)
const headlessLibrary: LibraryInfo = LIBRARY_INFO['headless'] ?? {
  id: 'headless',
  name: 'Headless UI',
  version: 'latest',
  installCommand: 'npm install @headlessui/react',
  docsUrl: 'https://headlessui.com',
  license: 'MIT',
};

const menuComponent: IndexedComponent = {
  id: 'headless-menu',
  name: 'Menu',
  library: headlessLibrary,
  category: 'overlay',
  tags: ['dropdown', 'actions', 'popup', 'select', 'options'],
  description: 'Dropdown menu for displaying a list of actions',
  importStatement: "import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-8">
      <div className="relative inline-block">
        <button className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 flex items-center gap-2">
          Options
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 4l4 4 4-4" />
          </svg>
        </button>
        <div className="absolute mt-2 w-48 bg-white rounded-md shadow-lg border p-1">
          <button className="w-full px-3 py-2 text-left text-sm rounded hover:bg-slate-100">Edit</button>
          <button className="w-full px-3 py-2 text-left text-sm rounded hover:bg-slate-100">Duplicate</button>
          <button className="w-full px-3 py-2 text-left text-sm rounded hover:bg-slate-100">Archive</button>
          <button className="w-full px-3 py-2 text-left text-sm rounded text-red-600 hover:bg-red-50">Delete</button>
        </div>
      </div>
    </div>
  );
}`,
  props: [
    {
      name: 'as',
      type: 'string | Component',
      required: false,
      default: 'Fragment',
      description: 'Element to render as',
    },
  ],
  variants: [],
  dependencies: ['@headlessui/react'],
  previewCode:
    '<Menu><MenuButton>Options</MenuButton><MenuItems><MenuItem>Edit</MenuItem></MenuItems></Menu>',
  livePreviewable: true,
  usageGuidelines: 'Use for action menus. Pairs well with Tailwind CSS for styling.',
  accessibilityNotes: 'Full keyboard navigation. Escape to close.',
  relatedComponents: ['headless-listbox'],
};

const listboxComponent: IndexedComponent = {
  id: 'headless-listbox',
  name: 'Listbox',
  library: headlessLibrary,
  category: 'input',
  tags: ['select', 'dropdown', 'picker', 'options', 'form'],
  description: 'Custom select component for single value selection',
  importStatement:
    "import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-4 w-64">
      <button className="w-full px-3 py-2 border rounded-md flex items-center justify-between text-sm bg-white">
        <span>Select person...</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 4l4 4 4-4" />
        </svg>
      </button>
      <div className="mt-2 w-full bg-white rounded-md shadow-lg border p-1">
        <button className="w-full px-3 py-2 text-left text-sm rounded bg-slate-100">Wade Cooper</button>
        <button className="w-full px-3 py-2 text-left text-sm rounded hover:bg-slate-100">Arlene Mccoy</button>
        <button className="w-full px-3 py-2 text-left text-sm rounded hover:bg-slate-100">Devon Webb</button>
      </div>
    </div>
  );
}`,
  props: [
    { name: 'value', type: 'T', required: false, description: 'Controlled value' },
    { name: 'defaultValue', type: 'T', required: false, description: 'Default value' },
    {
      name: 'onChange',
      type: '(value: T) => void',
      required: false,
      description: 'Value change handler',
    },
    {
      name: 'multiple',
      type: 'boolean',
      required: false,
      default: false,
      description: 'Allow multiple selection',
    },
    { name: 'disabled', type: 'boolean', required: false, description: 'Disable the listbox' },
    {
      name: 'by',
      type: 'string | ((a: T, b: T) => boolean)',
      required: false,
      description: 'Comparison function',
    },
  ],
  variants: [],
  dependencies: ['@headlessui/react'],
  previewCode:
    '<Listbox value={selected} onChange={setSelected}><ListboxButton>{selected}</ListboxButton><ListboxOptions>...</ListboxOptions></Listbox>',
  livePreviewable: true,
  usageGuidelines:
    'Use for custom styled select inputs. Support multiple selection with multiple prop.',
  accessibilityNotes: 'Full keyboard navigation. Type-ahead selection.',
  relatedComponents: ['headless-combobox', 'headless-menu'],
};

const comboboxComponent: IndexedComponent = {
  id: 'headless-combobox',
  name: 'Combobox',
  library: headlessLibrary,
  category: 'input',
  tags: ['autocomplete', 'search', 'select', 'typeahead', 'form'],
  description: 'Autocomplete input with searchable options',
  importStatement:
    "import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-4 w-64">
      <div className="relative">
        <input
          className="w-full px-3 py-2 border rounded-md text-sm"
          placeholder="Search people..."
        />
        <button className="absolute right-2 top-1/2 -translate-y-1/2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
      </div>
      <div className="mt-2 w-full bg-white rounded-md shadow-lg border p-1">
        <button className="w-full px-3 py-2 text-left text-sm rounded hover:bg-slate-100">Wade Cooper</button>
        <button className="w-full px-3 py-2 text-left text-sm rounded hover:bg-slate-100">Arlene Mccoy</button>
      </div>
    </div>
  );
}`,
  props: [
    { name: 'value', type: 'T', required: false, description: 'Controlled value' },
    { name: 'defaultValue', type: 'T', required: false, description: 'Default value' },
    {
      name: 'onChange',
      type: '(value: T) => void',
      required: false,
      description: 'Value change handler',
    },
    {
      name: 'multiple',
      type: 'boolean',
      required: false,
      default: false,
      description: 'Allow multiple selection',
    },
    { name: 'disabled', type: 'boolean', required: false, description: 'Disable the combobox' },
    {
      name: 'nullable',
      type: 'boolean',
      required: false,
      default: false,
      description: 'Allow clearing value',
    },
  ],
  variants: [],
  dependencies: ['@headlessui/react'],
  previewCode:
    '<Combobox value={selected} onChange={setSelected}><ComboboxInput /><ComboboxOptions>...</ComboboxOptions></Combobox>',
  livePreviewable: true,
  usageGuidelines: 'Use for searchable/filterable selection. Filter options based on input.',
  accessibilityNotes: 'Full keyboard navigation. Announces filtered results.',
  relatedComponents: ['headless-listbox'],
};

const switchComponent: IndexedComponent = {
  id: 'headless-switch',
  name: 'Switch',
  library: headlessLibrary,
  category: 'input',
  tags: ['toggle', 'boolean', 'on-off', 'settings', 'checkbox'],
  description: 'Toggle switch for boolean settings',
  importStatement: "import { Switch } from '@headlessui/react'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="flex items-center gap-3 p-4">
      <button
        className="relative w-11 h-6 bg-slate-900 rounded-full transition-colors"
        role="switch"
        aria-checked="true"
      >
        <span className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform translate-x-5" />
      </button>
      <span className="text-sm">Enable notifications</span>
    </div>
  );
}`,
  props: [
    { name: 'checked', type: 'boolean', required: false, description: 'Controlled checked state' },
    {
      name: 'defaultChecked',
      type: 'boolean',
      required: false,
      description: 'Default checked state',
    },
    {
      name: 'onChange',
      type: '(checked: boolean) => void',
      required: false,
      description: 'Change handler',
    },
    { name: 'disabled', type: 'boolean', required: false, description: 'Disable the switch' },
    { name: 'name', type: 'string', required: false, description: 'Form field name' },
    { name: 'value', type: 'string', required: false, description: 'Form field value' },
  ],
  variants: [],
  dependencies: ['@headlessui/react'],
  previewCode: '<Switch checked={enabled} onChange={setEnabled} className="..." />',
  livePreviewable: true,
  usageGuidelines: 'Use for on/off settings. Provide a label for accessibility.',
  accessibilityNotes: 'Uses switch role. Space to toggle.',
  relatedComponents: ['headless-checkbox'],
};

const disclosureComponent: IndexedComponent = {
  id: 'headless-disclosure',
  name: 'Disclosure',
  library: headlessLibrary,
  category: 'display',
  tags: ['accordion', 'collapsible', 'expand', 'toggle', 'faq'],
  description: 'Collapsible content section',
  importStatement:
    "import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="w-full max-w-md p-4">
      <div className="bg-white rounded-lg shadow">
        <button className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium hover:bg-slate-50 rounded-lg">
          <span>What is your refund policy?</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
        <div className="px-4 pb-3 text-sm text-slate-600">
          If you're unhappy with your purchase, we'll refund you in full.
        </div>
      </div>
    </div>
  );
}`,
  props: [
    { name: 'defaultOpen', type: 'boolean', required: false, description: 'Default open state' },
    {
      name: 'as',
      type: 'string | Component',
      required: false,
      default: 'Fragment',
      description: 'Element to render as',
    },
  ],
  variants: [],
  dependencies: ['@headlessui/react'],
  previewCode:
    '<Disclosure><DisclosureButton>Toggle</DisclosureButton><DisclosurePanel>Content</DisclosurePanel></Disclosure>',
  livePreviewable: true,
  usageGuidelines: 'Use for FAQs, accordions, or collapsible sections.',
  accessibilityNotes: 'Uses aria-expanded. Keyboard accessible.',
  relatedComponents: [],
};

const dialogComponent: IndexedComponent = {
  id: 'headless-dialog',
  name: 'Dialog',
  library: headlessLibrary,
  category: 'overlay',
  tags: ['modal', 'popup', 'overlay', 'window', 'alert'],
  description: 'Modal dialog with backdrop',
  importStatement:
    "import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-8">
      <button className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800">
        Open Dialog
      </button>
      {/* Dialog would appear on click */}
      <div className="fixed inset-0 bg-black/30 hidden" />
      <div className="fixed inset-0 flex items-center justify-center p-4 hidden">
        <div className="bg-white rounded-lg p-6 max-w-md shadow-xl">
          <h3 className="text-lg font-semibold">Payment successful</h3>
          <p className="mt-2 text-sm text-slate-600">
            Your payment has been successfully submitted. We've sent you an email with all of the details.
          </p>
          <button className="mt-4 px-4 py-2 bg-slate-900 text-white text-sm rounded-md hover:bg-slate-800">
            Got it, thanks!
          </button>
        </div>
      </div>
    </div>
  );
}`,
  props: [
    { name: 'open', type: 'boolean', required: true, description: 'Open state' },
    {
      name: 'onClose',
      type: '(value: boolean) => void',
      required: true,
      description: 'Close handler',
    },
    {
      name: 'as',
      type: 'string | Component',
      required: false,
      default: 'div',
      description: 'Element to render as',
    },
  ],
  variants: [],
  dependencies: ['@headlessui/react'],
  previewCode:
    '<Dialog open={isOpen} onClose={setIsOpen}><DialogBackdrop /><DialogPanel><DialogTitle>Title</DialogTitle></DialogPanel></Dialog>',
  livePreviewable: true,
  usageGuidelines: 'Use for focused tasks or confirmations. Traps focus and handles escape.',
  accessibilityNotes: 'Focus trapped. Escape to close. Announces as dialog.',
  relatedComponents: [],
};

const popoverComponent: IndexedComponent = {
  id: 'headless-popover',
  name: 'Popover',
  library: headlessLibrary,
  category: 'overlay',
  tags: ['popup', 'dropdown', 'floating', 'tooltip', 'panel'],
  description: 'Floating panel anchored to a trigger',
  importStatement: "import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-8">
      <button className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800">
        Solutions
      </button>
      {/* Panel would appear on click */}
      <div className="mt-2 w-64 bg-white rounded-lg shadow-lg border p-4">
        <div className="space-y-3">
          <a href="#" className="block p-2 rounded hover:bg-slate-50">
            <p className="text-sm font-medium">Analytics</p>
            <p className="text-xs text-slate-500">Measure actions your users take</p>
          </a>
          <a href="#" className="block p-2 rounded hover:bg-slate-50">
            <p className="text-sm font-medium">Engagement</p>
            <p className="text-xs text-slate-500">Create meaningful experiences</p>
          </a>
        </div>
      </div>
    </div>
  );
}`,
  props: [
    {
      name: 'as',
      type: 'string | Component',
      required: false,
      default: 'div',
      description: 'Element to render as',
    },
  ],
  variants: [],
  dependencies: ['@headlessui/react'],
  previewCode:
    '<Popover><PopoverButton>Open</PopoverButton><PopoverPanel>Content</PopoverPanel></Popover>',
  livePreviewable: true,
  usageGuidelines: 'Use for rich floating content. For simple menus, use Menu.',
  accessibilityNotes: 'Focus moves to panel. Escape to close.',
  relatedComponents: ['headless-menu'],
};

const radioGroupComponent: IndexedComponent = {
  id: 'headless-radio-group',
  name: 'RadioGroup',
  library: headlessLibrary,
  category: 'input',
  tags: ['form', 'select', 'options', 'choice', 'single'],
  description: 'Radio button group for single selection',
  importStatement: "import { RadioGroup, Radio, Label, Description } from '@headlessui/react'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="w-full max-w-md p-4">
      <div className="space-y-2">
        <div className="flex items-center gap-3 p-3 border rounded-lg bg-slate-900 text-white">
          <div className="w-4 h-4 border-2 border-white rounded-full flex items-center justify-center">
            <div className="w-2 h-2 bg-white rounded-full" />
          </div>
          <div>
            <p className="text-sm font-medium">Startup</p>
            <p className="text-xs opacity-75">12GB / 6 CPUs</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 border rounded-lg hover:bg-slate-50">
          <div className="w-4 h-4 border-2 border-slate-300 rounded-full" />
          <div>
            <p className="text-sm font-medium">Business</p>
            <p className="text-xs text-slate-500">16GB / 8 CPUs</p>
          </div>
        </div>
      </div>
    </div>
  );
}`,
  props: [
    { name: 'value', type: 'T', required: false, description: 'Controlled value' },
    { name: 'defaultValue', type: 'T', required: false, description: 'Default value' },
    {
      name: 'onChange',
      type: '(value: T) => void',
      required: false,
      description: 'Value change handler',
    },
    { name: 'disabled', type: 'boolean', required: false, description: 'Disable all options' },
    {
      name: 'by',
      type: 'string | ((a: T, b: T) => boolean)',
      required: false,
      description: 'Comparison function',
    },
  ],
  variants: [],
  dependencies: ['@headlessui/react'],
  previewCode:
    '<RadioGroup value={selected} onChange={setSelected}><Radio value="a">Option A</Radio><Radio value="b">Option B</Radio></RadioGroup>',
  livePreviewable: true,
  usageGuidelines: 'Use for single selection from visible options. Style each option freely.',
  accessibilityNotes: 'Arrow keys to navigate. Native radio group behavior.',
  relatedComponents: ['headless-listbox'],
};

const tabsComponent: IndexedComponent = {
  id: 'headless-tabs',
  name: 'Tabs',
  library: headlessLibrary,
  category: 'navigation',
  tags: ['navigation', 'panels', 'sections', 'tabbed', 'content'],
  description: 'Tabbed content panels',
  importStatement:
    "import { TabGroup, TabList, Tab, TabPanels, TabPanel } from '@headlessui/react'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="w-full max-w-md p-4">
      <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg">
        <button className="flex-1 py-2 text-sm font-medium rounded-md bg-white shadow">
          Recent
        </button>
        <button className="flex-1 py-2 text-sm font-medium rounded-md text-slate-600 hover:bg-white/50">
          Popular
        </button>
        <button className="flex-1 py-2 text-sm font-medium rounded-md text-slate-600 hover:bg-white/50">
          Trending
        </button>
      </div>
      <div className="mt-4 p-4 bg-white rounded-lg shadow">
        <h3 className="text-sm font-medium">Recent posts</h3>
        <p className="mt-2 text-sm text-slate-600">Your recent posts will appear here.</p>
      </div>
    </div>
  );
}`,
  props: [
    {
      name: 'selectedIndex',
      type: 'number',
      required: false,
      description: 'Controlled selected tab index',
    },
    {
      name: 'defaultIndex',
      type: 'number',
      required: false,
      default: 0,
      description: 'Default selected tab',
    },
    {
      name: 'onChange',
      type: '(index: number) => void',
      required: false,
      description: 'Selection change handler',
    },
    {
      name: 'vertical',
      type: 'boolean',
      required: false,
      default: false,
      description: 'Vertical orientation',
    },
    {
      name: 'manual',
      type: 'boolean',
      required: false,
      default: false,
      description: 'Manual activation mode',
    },
  ],
  variants: [],
  dependencies: ['@headlessui/react'],
  previewCode:
    '<TabGroup><TabList><Tab>Tab 1</Tab><Tab>Tab 2</Tab></TabList><TabPanels><TabPanel>Content 1</TabPanel><TabPanel>Content 2</TabPanel></TabPanels></TabGroup>',
  livePreviewable: true,
  usageGuidelines: 'Use for content that can be logically grouped. Style tabs and panels freely.',
  accessibilityNotes: 'Arrow keys to navigate tabs. Tab to enter panel.',
  relatedComponents: ['headless-disclosure'],
};

const transitionComponent: IndexedComponent = {
  id: 'headless-transition',
  name: 'Transition',
  library: headlessLibrary,
  category: 'feedback',
  tags: ['animation', 'fade', 'enter', 'leave', 'motion'],
  description: 'Enter/leave transitions for elements',
  importStatement: "import { Transition } from '@headlessui/react'",
  code: `import React, { useState } from 'react';

export default function App() {
  return (
    <div className="p-8">
      <button className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 mb-4">
        Toggle
      </button>
      {/* This would animate in/out */}
      <div className="w-48 h-24 bg-blue-500 rounded-lg flex items-center justify-center text-white font-medium">
        I will fade in and out
      </div>
    </div>
  );
}`,
  props: [
    { name: 'show', type: 'boolean', required: false, description: 'Show/hide state' },
    {
      name: 'appear',
      type: 'boolean',
      required: false,
      default: false,
      description: 'Animate on initial mount',
    },
    { name: 'enter', type: 'string', required: false, description: 'Enter transition classes' },
    { name: 'enterFrom', type: 'string', required: false, description: 'Starting state classes' },
    { name: 'enterTo', type: 'string', required: false, description: 'Ending state classes' },
    { name: 'leave', type: 'string', required: false, description: 'Leave transition classes' },
    { name: 'leaveFrom', type: 'string', required: false, description: 'Starting state classes' },
    { name: 'leaveTo', type: 'string', required: false, description: 'Ending state classes' },
  ],
  variants: [],
  dependencies: ['@headlessui/react'],
  previewCode:
    '<Transition show={isShowing} enter="transition-opacity" enterFrom="opacity-0" enterTo="opacity-100">Content</Transition>',
  livePreviewable: true,
  usageGuidelines: 'Use for enter/leave animations. Pairs perfectly with Tailwind transitions.',
  accessibilityNotes: 'Respects prefers-reduced-motion.',
  relatedComponents: [],
};

const fieldComponent: IndexedComponent = {
  id: 'headless-field',
  name: 'Field',
  library: headlessLibrary,
  category: 'input',
  tags: ['form', 'label', 'input', 'description', 'error'],
  description: 'Form field wrapper with label and description',
  importStatement: "import { Field, Label, Input, Description } from '@headlessui/react'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="w-full max-w-sm p-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-900">Full name</label>
        <input
          type="text"
          className="w-full px-3 py-2 border rounded-md text-sm"
          placeholder="Enter your name"
        />
        <p className="text-xs text-slate-500">Use your real name so people can recognize you.</p>
      </div>
    </div>
  );
}`,
  props: [{ name: 'disabled', type: 'boolean', required: false, description: 'Disable the field' }],
  variants: [],
  dependencies: ['@headlessui/react'],
  previewCode:
    '<Field><Label>Name</Label><Input /><Description>Enter your name</Description></Field>',
  livePreviewable: true,
  usageGuidelines:
    'Use to group label, input, and description. Automatically handles accessibility.',
  accessibilityNotes: 'Label automatically associated with input.',
  relatedComponents: ['headless-input'],
};

const inputComponent: IndexedComponent = {
  id: 'headless-input',
  name: 'Input',
  library: headlessLibrary,
  category: 'input',
  tags: ['form', 'text', 'textbox', 'field', 'type'],
  description: 'Accessible text input with data attributes',
  importStatement: "import { Input } from '@headlessui/react'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="w-full max-w-sm p-4">
      <input
        type="text"
        className="w-full px-3 py-2 border rounded-md text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        placeholder="Type something..."
      />
    </div>
  );
}`,
  props: [
    { name: 'disabled', type: 'boolean', required: false, description: 'Disable the input' },
    { name: 'invalid', type: 'boolean', required: false, description: 'Mark as invalid' },
  ],
  variants: [],
  dependencies: ['@headlessui/react'],
  previewCode: '<Input placeholder="Type here..." />',
  livePreviewable: true,
  usageGuidelines: 'Use with Field for complete form fields. Includes data attributes for styling.',
  accessibilityNotes: 'Exposes data-disabled and data-invalid attributes.',
  relatedComponents: ['headless-field', 'headless-textarea'],
};

const textareaComponent: IndexedComponent = {
  id: 'headless-textarea',
  name: 'Textarea',
  library: headlessLibrary,
  category: 'input',
  tags: ['form', 'text', 'multiline', 'field', 'message'],
  description: 'Accessible multi-line text input',
  importStatement: "import { Textarea } from '@headlessui/react'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="w-full max-w-sm p-4">
      <textarea
        className="w-full px-3 py-2 border rounded-md text-sm resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        rows={4}
        placeholder="Write your message..."
      />
    </div>
  );
}`,
  props: [
    { name: 'disabled', type: 'boolean', required: false, description: 'Disable the textarea' },
    { name: 'invalid', type: 'boolean', required: false, description: 'Mark as invalid' },
  ],
  variants: [],
  dependencies: ['@headlessui/react'],
  previewCode: '<Textarea placeholder="Enter description..." />',
  livePreviewable: true,
  usageGuidelines: 'Use for multi-line text input. Pairs with Field for complete form fields.',
  accessibilityNotes: 'Exposes data-disabled and data-invalid attributes.',
  relatedComponents: ['headless-field', 'headless-input'],
};

const selectComponent: IndexedComponent = {
  id: 'headless-select',
  name: 'Select',
  library: headlessLibrary,
  category: 'input',
  tags: ['form', 'dropdown', 'native', 'picker', 'options'],
  description: 'Native select element with data attributes',
  importStatement: "import { Select } from '@headlessui/react'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="w-full max-w-sm p-4">
      <select className="w-full px-3 py-2 border rounded-md text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
        <option value="">Select a country...</option>
        <option value="us">United States</option>
        <option value="ca">Canada</option>
        <option value="uk">United Kingdom</option>
      </select>
    </div>
  );
}`,
  props: [
    { name: 'disabled', type: 'boolean', required: false, description: 'Disable the select' },
    { name: 'invalid', type: 'boolean', required: false, description: 'Mark as invalid' },
  ],
  variants: [],
  dependencies: ['@headlessui/react'],
  previewCode: '<Select><option>Option 1</option><option>Option 2</option></Select>',
  livePreviewable: true,
  usageGuidelines: 'Use for native select elements. For custom dropdowns, use Listbox.',
  accessibilityNotes: 'Native select accessibility. Exposes data attributes for styling.',
  relatedComponents: ['headless-listbox'],
};

const checkboxComponent: IndexedComponent = {
  id: 'headless-checkbox',
  name: 'Checkbox',
  library: headlessLibrary,
  category: 'input',
  tags: ['form', 'toggle', 'boolean', 'checked', 'tick'],
  description: 'Custom checkbox component',
  importStatement: "import { Checkbox } from '@headlessui/react'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="flex items-center gap-2 p-4">
      <button
        className="w-5 h-5 rounded border-2 border-slate-300 flex items-center justify-center data-[checked]:bg-slate-900 data-[checked]:border-slate-900"
        data-checked
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2">
          <path d="M2 6l3 3 5-6" />
        </svg>
      </button>
      <span className="text-sm">Remember me</span>
    </div>
  );
}`,
  props: [
    { name: 'checked', type: 'boolean', required: false, description: 'Controlled checked state' },
    {
      name: 'defaultChecked',
      type: 'boolean',
      required: false,
      description: 'Default checked state',
    },
    {
      name: 'onChange',
      type: '(checked: boolean) => void',
      required: false,
      description: 'Change handler',
    },
    { name: 'disabled', type: 'boolean', required: false, description: 'Disable the checkbox' },
    { name: 'indeterminate', type: 'boolean', required: false, description: 'Indeterminate state' },
  ],
  variants: [],
  dependencies: ['@headlessui/react'],
  previewCode: '<Checkbox checked={enabled} onChange={setEnabled}>Remember me</Checkbox>',
  livePreviewable: true,
  usageGuidelines: 'Use for boolean form inputs. Supports indeterminate state.',
  accessibilityNotes: 'Native checkbox accessibility. Space to toggle.',
  relatedComponents: ['headless-switch'],
};

const buttonComponent: IndexedComponent = {
  id: 'headless-button',
  name: 'Button',
  library: headlessLibrary,
  category: 'input',
  tags: ['action', 'form', 'clickable', 'submit', 'interactive'],
  description: 'Accessible button with data attributes',
  importStatement: "import { Button } from '@headlessui/react'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="p-4 space-x-2">
      <button className="px-4 py-2 bg-slate-900 text-white text-sm rounded-md hover:bg-slate-800 focus:ring-2 focus:ring-offset-2 focus:ring-slate-900">
        Primary
      </button>
      <button className="px-4 py-2 border text-sm rounded-md hover:bg-slate-50">
        Secondary
      </button>
    </div>
  );
}`,
  props: [
    { name: 'disabled', type: 'boolean', required: false, description: 'Disable the button' },
    {
      name: 'type',
      type: '"button" | "submit" | "reset"',
      required: false,
      default: 'button',
      description: 'Button type',
    },
  ],
  variants: [],
  dependencies: ['@headlessui/react'],
  previewCode: '<Button>Click me</Button>',
  livePreviewable: true,
  usageGuidelines: 'Use for interactive actions. Exposes data attributes for focus/hover states.',
  accessibilityNotes:
    'Native button accessibility. data-active, data-hover, data-focus attributes.',
  relatedComponents: [],
};

const fieldsetComponent: IndexedComponent = {
  id: 'headless-fieldset',
  name: 'Fieldset',
  library: headlessLibrary,
  category: 'input',
  tags: ['form', 'group', 'legend', 'fields', 'section'],
  description: 'Group related form fields with a legend',
  importStatement: "import { Fieldset, Legend } from '@headlessui/react'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="w-full max-w-md p-4">
      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-slate-900">Shipping details</legend>
        <div className="space-y-2">
          <label className="text-sm font-medium">Street address</label>
          <input type="text" className="w-full px-3 py-2 border rounded-md text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">City</label>
            <input type="text" className="w-full px-3 py-2 border rounded-md text-sm" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Postal code</label>
            <input type="text" className="w-full px-3 py-2 border rounded-md text-sm" />
          </div>
        </div>
      </fieldset>
    </div>
  );
}`,
  props: [
    {
      name: 'disabled',
      type: 'boolean',
      required: false,
      description: 'Disable all fields in the fieldset',
    },
  ],
  variants: [],
  dependencies: ['@headlessui/react'],
  previewCode: '<Fieldset><Legend>Title</Legend><Field>...</Field></Fieldset>',
  livePreviewable: true,
  usageGuidelines: 'Use to group related form fields. Disabling fieldset disables all children.',
  accessibilityNotes: 'Native fieldset/legend accessibility.',
  relatedComponents: ['headless-field'],
};

const descriptionComponent: IndexedComponent = {
  id: 'headless-description',
  name: 'Description',
  library: headlessLibrary,
  category: 'display',
  tags: ['text', 'help', 'info', 'form', 'hint'],
  description: 'Helper text for form fields',
  importStatement: "import { Description } from '@headlessui/react'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="w-full max-w-sm p-4 space-y-2">
      <label className="text-sm font-medium">Password</label>
      <input type="password" className="w-full px-3 py-2 border rounded-md text-sm" />
      <p className="text-xs text-slate-500">Must be at least 8 characters with one uppercase letter.</p>
    </div>
  );
}`,
  props: [
    {
      name: 'as',
      type: 'string | Component',
      required: false,
      default: 'p',
      description: 'Element to render as',
    },
  ],
  variants: [],
  dependencies: ['@headlessui/react'],
  previewCode: '<Description>Helper text for the field</Description>',
  livePreviewable: true,
  usageGuidelines:
    'Use within Field to provide additional context. Auto-linked via aria-describedby.',
  accessibilityNotes: 'Automatically linked to parent Field via aria-describedby.',
  relatedComponents: ['headless-field', 'headless-label'],
};

const labelComponent: IndexedComponent = {
  id: 'headless-label',
  name: 'Label',
  library: headlessLibrary,
  category: 'input',
  tags: ['form', 'text', 'accessibility', 'input', 'field'],
  description: 'Accessible label for form controls',
  importStatement: "import { Label } from '@headlessui/react'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="w-full max-w-sm p-4 space-y-2">
      <label className="text-sm font-medium text-slate-900">Email address</label>
      <input type="email" className="w-full px-3 py-2 border rounded-md text-sm" placeholder="you@example.com" />
    </div>
  );
}`,
  props: [
    {
      name: 'as',
      type: 'string | Component',
      required: false,
      default: 'label',
      description: 'Element to render as',
    },
  ],
  variants: [],
  dependencies: ['@headlessui/react'],
  previewCode: '<Label>Field label</Label>',
  livePreviewable: true,
  usageGuidelines: 'Use within Field to label form inputs. Auto-linked to the input.',
  accessibilityNotes: 'Automatically linked to parent Field. Click to focus input.',
  relatedComponents: ['headless-field', 'headless-description'],
};

const closeButtonComponent: IndexedComponent = {
  id: 'headless-close-button',
  name: 'CloseButton',
  library: headlessLibrary,
  category: 'input',
  tags: ['close', 'dismiss', 'dialog', 'popover', 'x'],
  description: 'Button that closes parent Dialog or Popover',
  importStatement: "import { CloseButton } from '@headlessui/react'",
  code: `import React from 'react';

export default function App() {
  return (
    <div className="relative w-64 p-4 bg-white rounded-lg shadow-lg border">
      <button className="absolute top-2 right-2 p-1 rounded hover:bg-slate-100">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
      <h3 className="font-medium">Notification</h3>
      <p className="mt-2 text-sm text-slate-600">Click the X to close this panel.</p>
    </div>
  );
}`,
  props: [
    {
      name: 'as',
      type: 'string | Component',
      required: false,
      default: 'button',
      description: 'Element to render as',
    },
  ],
  variants: [],
  dependencies: ['@headlessui/react'],
  previewCode: '<CloseButton><XIcon /></CloseButton>',
  livePreviewable: true,
  usageGuidelines:
    'Use inside Dialog or Popover to close it. Automatically wired to close handler.',
  accessibilityNotes: 'Closes parent Dialog/Popover. Keyboard accessible.',
  relatedComponents: ['headless-dialog', 'headless-popover'],
};

export const headlessUIComponents: IndexedComponent[] = [
  menuComponent,
  listboxComponent,
  comboboxComponent,
  switchComponent,
  disclosureComponent,
  dialogComponent,
  popoverComponent,
  radioGroupComponent,
  tabsComponent,
  transitionComponent,
  fieldComponent,
  inputComponent,
  textareaComponent,
  selectComponent,
  checkboxComponent,
  buttonComponent,
  fieldsetComponent,
  descriptionComponent,
  labelComponent,
  closeButtonComponent,
];

export const headlessUIIndex: LibraryIndex = {
  library: headlessLibrary,
  components: headlessUIComponents,
  lastUpdated: new Date().toISOString(),
  schemaVersion: LIBRARY_SCHEMA_VERSION,
};

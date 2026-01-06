/**
 * Lucide Icons Index
 * Popular icons for the Libraries panel
 */

import { LIBRARY_INFO, LIBRARY_SCHEMA_VERSION } from '../componentLibraryTypes';

import type { LibraryIndex, IndexedComponent } from '../componentLibraryTypes';

const lucideLibrary = LIBRARY_INFO['lucide'];
if (lucideLibrary === undefined) throw new Error('lucide library config missing from LIBRARY_INFO');
const lucideLib = lucideLibrary; // TypeScript narrowed reference

function createIconComponent(
  name: string,
  tags: string[],
  description: string,
  svgPath: string
): IndexedComponent {
  // Create SVG preview that can be rendered via dangerouslySetInnerHTML
  const svgPreview = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg>`;

  return {
    id: `lucide-${name.toLowerCase()}`,
    name,
    library: lucideLib,
    category: 'icon',
    tags,
    description,
    importStatement: `import { ${name} } from 'lucide-react'`,
    code: `import React from 'react';

export default function App() {
  return (
    <div className="p-4 flex items-center gap-4">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        ${svgPath}
      </svg>
      <span className="text-sm text-slate-600">${name}</span>
    </div>
  );
}`,
    props: [
      {
        name: 'size',
        type: 'number | string',
        required: false,
        default: 24,
        description: 'Icon size in pixels',
      },
      {
        name: 'color',
        type: 'string',
        required: false,
        default: 'currentColor',
        description: 'Icon stroke color',
      },
      {
        name: 'strokeWidth',
        type: 'number',
        required: false,
        default: 2,
        description: 'SVG stroke width',
      },
    ],
    variants: [],
    dependencies: [],
    previewCode: svgPreview,
    livePreviewable: true,
    usageGuidelines: description,
    accessibilityNotes: 'Add aria-label when used as standalone clickable element',
    relatedComponents: [],
  };
}

export const lucideIcons: IndexedComponent[] = [
  // Navigation
  createIconComponent(
    'Home',
    ['navigation', 'house', 'main', 'landing'],
    'Home/house icon for navigation',
    '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'
  ),
  createIconComponent(
    'Menu',
    ['navigation', 'hamburger', 'bars', 'sidebar'],
    'Menu hamburger icon',
    '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>'
  ),
  createIconComponent(
    'ArrowLeft',
    ['navigation', 'back', 'previous'],
    'Left arrow for back navigation',
    '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>'
  ),
  createIconComponent(
    'ArrowRight',
    ['navigation', 'forward', 'next'],
    'Right arrow for forward navigation',
    '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'
  ),
  createIconComponent(
    'ChevronDown',
    ['navigation', 'expand', 'dropdown'],
    'Chevron down for dropdowns',
    '<path d="m6 9 6 6 6-6"/>'
  ),
  createIconComponent(
    'ChevronUp',
    ['navigation', 'collapse', 'close'],
    'Chevron up for collapsing',
    '<path d="m18 15-6-6-6 6"/>'
  ),
  createIconComponent(
    'ChevronLeft',
    ['navigation', 'previous', 'back'],
    'Chevron left for pagination',
    '<path d="m15 18-6-6 6-6"/>'
  ),
  createIconComponent(
    'ChevronRight',
    ['navigation', 'next', 'forward'],
    'Chevron right for pagination',
    '<path d="m9 18 6-6-6-6"/>'
  ),

  // Actions
  createIconComponent(
    'Plus',
    ['action', 'add', 'create', 'new'],
    'Plus icon for adding items',
    '<path d="M5 12h14"/><path d="M12 5v14"/>'
  ),
  createIconComponent(
    'Minus',
    ['action', 'remove', 'subtract'],
    'Minus icon for removing',
    '<path d="M5 12h14"/>'
  ),
  createIconComponent(
    'X',
    ['action', 'close', 'cancel', 'delete'],
    'X icon for closing or canceling',
    '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
  ),
  createIconComponent(
    'Check',
    ['action', 'confirm', 'success', 'done'],
    'Check mark for confirmation',
    '<path d="M20 6 9 17l-5-5"/>'
  ),
  createIconComponent(
    'Search',
    ['action', 'find', 'lookup', 'magnify'],
    'Search/magnifying glass icon',
    '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'
  ),
  createIconComponent(
    'Edit',
    ['action', 'modify', 'pencil', 'write'],
    'Edit/pencil icon',
    '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'
  ),
  createIconComponent(
    'Trash',
    ['action', 'delete', 'remove', 'bin'],
    'Trash icon for deletion',
    '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>'
  ),
  createIconComponent(
    'Copy',
    ['action', 'duplicate', 'clipboard'],
    'Copy to clipboard icon',
    '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'
  ),
  createIconComponent(
    'Download',
    ['action', 'save', 'export'],
    'Download icon',
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>'
  ),
  createIconComponent(
    'Upload',
    ['action', 'import', 'send'],
    'Upload icon',
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>'
  ),
  createIconComponent(
    'Share',
    ['action', 'send', 'social'],
    'Share icon',
    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>'
  ),
  createIconComponent(
    'ExternalLink',
    ['action', 'open', 'new-window'],
    'External link icon',
    '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/>'
  ),
  createIconComponent(
    'MoreHorizontal',
    ['action', 'menu', 'options', 'dots'],
    'Horizontal more options',
    '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'
  ),
  createIconComponent(
    'MoreVertical',
    ['action', 'menu', 'options', 'dots'],
    'Vertical more options',
    '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>'
  ),
  createIconComponent(
    'Refresh',
    ['action', 'reload', 'sync'],
    'Refresh/reload icon',
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>'
  ),

  // User & Account
  createIconComponent(
    'User',
    ['user', 'profile', 'person', 'account'],
    'User/person icon',
    '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'
  ),
  createIconComponent(
    'Users',
    ['user', 'team', 'group', 'people'],
    'Multiple users icon',
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
  ),
  createIconComponent(
    'LogIn',
    ['user', 'signin', 'enter'],
    'Log in icon',
    '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/>'
  ),
  createIconComponent(
    'LogOut',
    ['user', 'signout', 'exit'],
    'Log out icon',
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>'
  ),
  createIconComponent(
    'Settings',
    ['user', 'gear', 'config', 'preferences'],
    'Settings gear icon',
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
  ),

  // Communication
  createIconComponent(
    'Mail',
    ['communication', 'email', 'envelope', 'message'],
    'Email/mail icon',
    '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>'
  ),
  createIconComponent(
    'Phone',
    ['communication', 'call', 'contact', 'mobile'],
    'Phone icon',
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>'
  ),
  createIconComponent(
    'MessageSquare',
    ['communication', 'chat', 'comment', 'bubble'],
    'Chat message icon',
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'
  ),
  createIconComponent(
    'Bell',
    ['communication', 'notification', 'alert', 'ring'],
    'Notification bell icon',
    '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'
  ),
  createIconComponent(
    'Send',
    ['communication', 'submit', 'arrow'],
    'Send message icon',
    '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>'
  ),

  // Status & Feedback
  createIconComponent(
    'AlertCircle',
    ['status', 'error', 'warning', 'danger'],
    'Alert circle for warnings',
    '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>'
  ),
  createIconComponent(
    'AlertTriangle',
    ['status', 'warning', 'caution'],
    'Alert triangle for warnings',
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'
  ),
  createIconComponent(
    'Info',
    ['status', 'information', 'help', 'details'],
    'Info icon',
    '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'
  ),
  createIconComponent(
    'CheckCircle',
    ['status', 'success', 'complete', 'done'],
    'Success checkmark',
    '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>'
  ),
  createIconComponent(
    'XCircle',
    ['status', 'error', 'failed', 'close'],
    'Error/failed icon',
    '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>'
  ),
  createIconComponent(
    'Loader',
    ['status', 'loading', 'spinner', 'wait'],
    'Loading spinner',
    '<line x1="12" x2="12" y1="2" y2="6"/><line x1="12" x2="12" y1="18" y2="22"/><line x1="4.93" x2="7.76" y1="4.93" y2="7.76"/><line x1="16.24" x2="19.07" y1="16.24" y2="19.07"/><line x1="2" x2="6" y1="12" y2="12"/><line x1="18" x2="22" y1="12" y2="12"/><line x1="4.93" x2="7.76" y1="19.07" y2="16.24"/><line x1="16.24" x2="19.07" y1="7.76" y2="4.93"/>'
  ),

  // Media
  createIconComponent(
    'Image',
    ['media', 'photo', 'picture', 'gallery'],
    'Image/photo icon',
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>'
  ),
  createIconComponent(
    'Video',
    ['media', 'film', 'movie', 'camera'],
    'Video camera icon',
    '<path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>'
  ),
  createIconComponent(
    'Play',
    ['media', 'start', 'video', 'audio'],
    'Play button',
    '<polygon points="5 3 19 12 5 21 5 3"/>'
  ),
  createIconComponent(
    'Pause',
    ['media', 'stop', 'video', 'audio'],
    'Pause button',
    '<rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/>'
  ),
  createIconComponent(
    'Music',
    ['media', 'audio', 'song', 'sound'],
    'Music note icon',
    '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'
  ),

  // Files & Folders
  createIconComponent(
    'File',
    ['file', 'document', 'page'],
    'File icon',
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'
  ),
  createIconComponent(
    'FileText',
    ['file', 'document', 'text', 'page'],
    'Text file icon',
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><polyline points="10 9 9 9 8 9"/>'
  ),
  createIconComponent(
    'Folder',
    ['file', 'directory', 'folder'],
    'Folder icon',
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'
  ),
  createIconComponent(
    'FolderOpen',
    ['file', 'directory', 'folder', 'open'],
    'Open folder icon',
    '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>'
  ),

  // Layout & UI
  createIconComponent(
    'Layout',
    ['layout', 'dashboard', 'grid', 'design'],
    'Layout grid icon',
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="9" x2="9" y1="21" y2="9"/>'
  ),
  createIconComponent(
    'Grid',
    ['layout', 'gallery', 'tiles', 'squares'],
    'Grid layout icon',
    '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>'
  ),
  createIconComponent(
    'List',
    ['layout', 'menu', 'items', 'lines'],
    'List view icon',
    '<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>'
  ),
  createIconComponent(
    'Columns',
    ['layout', 'split', 'panel'],
    'Columns layout icon',
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="12" x2="12" y1="3" y2="21"/>'
  ),
  createIconComponent(
    'Sidebar',
    ['layout', 'panel', 'nav'],
    'Sidebar layout icon',
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="9" x2="9" y1="3" y2="21"/>'
  ),

  // Misc
  createIconComponent(
    'Star',
    ['misc', 'favorite', 'rating', 'bookmark'],
    'Star icon',
    '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'
  ),
  createIconComponent(
    'Heart',
    ['misc', 'like', 'love', 'favorite'],
    'Heart icon',
    '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>'
  ),
  createIconComponent(
    'Calendar',
    ['misc', 'date', 'schedule', 'event'],
    'Calendar icon',
    '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>'
  ),
  createIconComponent(
    'Clock',
    ['misc', 'time', 'schedule', 'timer'],
    'Clock icon',
    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'
  ),
  createIconComponent(
    'MapPin',
    ['misc', 'location', 'place', 'marker'],
    'Map pin/location icon',
    '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'
  ),
  createIconComponent(
    'Lock',
    ['misc', 'security', 'password', 'private'],
    'Lock icon',
    '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
  ),
  createIconComponent(
    'Eye',
    ['misc', 'view', 'visible', 'show'],
    'Eye/view icon',
    '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
  ),
  createIconComponent(
    'EyeOff',
    ['misc', 'hide', 'invisible', 'hidden'],
    'Eye off/hidden icon',
    '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" x2="23" y1="1" y2="23"/>'
  ),
  createIconComponent(
    'Zap',
    ['misc', 'lightning', 'power', 'fast'],
    'Lightning bolt icon',
    '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'
  ),
  createIconComponent(
    'Globe',
    ['misc', 'world', 'internet', 'web'],
    'Globe/world icon',
    '<circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'
  ),
  createIconComponent(
    'Code',
    ['misc', 'developer', 'programming', 'brackets'],
    'Code brackets icon',
    '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'
  ),
  createIconComponent(
    'Terminal',
    ['misc', 'console', 'cli', 'command'],
    'Terminal/console icon',
    '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>'
  ),
  createIconComponent(
    'Database',
    ['misc', 'storage', 'data', 'server'],
    'Database icon',
    '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>'
  ),
  createIconComponent(
    'Cloud',
    ['misc', 'weather', 'storage', 'upload'],
    'Cloud icon',
    '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>'
  ),

  // E-commerce
  createIconComponent(
    'ShoppingCart',
    ['ecommerce', 'cart', 'buy', 'store'],
    'Shopping cart icon',
    '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>'
  ),
  createIconComponent(
    'ShoppingBag',
    ['ecommerce', 'bag', 'store', 'purchase'],
    'Shopping bag icon',
    '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>'
  ),
  createIconComponent(
    'CreditCard',
    ['ecommerce', 'payment', 'card', 'bank'],
    'Credit card icon',
    '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>'
  ),
  createIconComponent(
    'DollarSign',
    ['ecommerce', 'money', 'currency', 'price'],
    'Dollar sign icon',
    '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'
  ),
  createIconComponent(
    'Wallet',
    ['ecommerce', 'money', 'payment', 'finance'],
    'Wallet icon',
    '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>'
  ),
  createIconComponent(
    'Tag',
    ['ecommerce', 'price', 'label', 'sale'],
    'Tag/label icon',
    '<path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/>'
  ),
  createIconComponent(
    'Gift',
    ['ecommerce', 'present', 'reward', 'bonus'],
    'Gift box icon',
    '<polyline points="20 12 20 22 4 22 4 12"/><rect width="20" height="5" x="2" y="7"/><line x1="12" x2="12" y1="22" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>'
  ),
  createIconComponent(
    'Percent',
    ['ecommerce', 'discount', 'sale', 'offer'],
    'Percent icon',
    '<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'
  ),
  createIconComponent(
    'Receipt',
    ['ecommerce', 'invoice', 'bill', 'order'],
    'Receipt icon',
    '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>'
  ),
  createIconComponent(
    'Store',
    ['ecommerce', 'shop', 'retail', 'business'],
    'Store/shop icon',
    '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7"/>'
  ),

  // Social
  createIconComponent(
    'ThumbsUp',
    ['social', 'like', 'approve', 'vote'],
    'Thumbs up icon',
    '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/>'
  ),
  createIconComponent(
    'ThumbsDown',
    ['social', 'dislike', 'reject', 'vote'],
    'Thumbs down icon',
    '<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z"/>'
  ),
  createIconComponent(
    'MessageCircle',
    ['social', 'chat', 'comment', 'discuss'],
    'Chat bubble icon',
    '<path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/>'
  ),
  createIconComponent(
    'AtSign',
    ['social', 'mention', 'email', 'username'],
    'At sign icon',
    '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>'
  ),
  createIconComponent(
    'Hash',
    ['social', 'hashtag', 'tag', 'topic'],
    'Hash/hashtag icon',
    '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>'
  ),
  createIconComponent(
    'Bookmark',
    ['social', 'save', 'favorite', 'read-later'],
    'Bookmark icon',
    '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>'
  ),
  createIconComponent(
    'Flag',
    ['social', 'report', 'mark', 'country'],
    'Flag icon',
    '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>'
  ),
  createIconComponent(
    'Award',
    ['social', 'badge', 'achievement', 'prize'],
    'Award badge icon',
    '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>'
  ),

  // More UI Elements
  createIconComponent(
    'Filter',
    ['ui', 'sort', 'funnel', 'refine'],
    'Filter funnel icon',
    '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>'
  ),
  createIconComponent(
    'Sliders',
    ['ui', 'settings', 'adjust', 'controls'],
    'Sliders/controls icon',
    '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>'
  ),
  createIconComponent(
    'Maximize',
    ['ui', 'fullscreen', 'expand', 'resize'],
    'Maximize/fullscreen icon',
    '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>'
  ),
  createIconComponent(
    'Minimize',
    ['ui', 'collapse', 'shrink', 'resize'],
    'Minimize icon',
    '<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>'
  ),
  createIconComponent(
    'ZoomIn',
    ['ui', 'magnify', 'enlarge', 'scale'],
    'Zoom in icon',
    '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/>'
  ),
  createIconComponent(
    'ZoomOut',
    ['ui', 'magnify', 'reduce', 'scale'],
    'Zoom out icon',
    '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/>'
  ),
  createIconComponent(
    'RotateCcw',
    ['ui', 'undo', 'rotate', 'reset'],
    'Rotate counter-clockwise',
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'
  ),
  createIconComponent(
    'RotateCw',
    ['ui', 'redo', 'rotate', 'forward'],
    'Rotate clockwise',
    '<path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>'
  ),
  createIconComponent(
    'Move',
    ['ui', 'drag', 'reorder', 'position'],
    'Move/drag icon',
    '<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="22"/>'
  ),
  createIconComponent(
    'Grip',
    ['ui', 'drag', 'handle', 'reorder'],
    'Grip handle icon',
    '<circle cx="12" cy="5" r="1"/><circle cx="19" cy="5" r="1"/><circle cx="5" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="12" cy="19" r="1"/><circle cx="19" cy="19" r="1"/><circle cx="5" cy="19" r="1"/>'
  ),
  createIconComponent(
    'Layers',
    ['ui', 'stack', 'levels', 'depth'],
    'Layers icon',
    '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'
  ),
  createIconComponent(
    'PanelLeft',
    ['ui', 'sidebar', 'layout', 'panel'],
    'Left panel icon',
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="9" x2="9" y1="3" y2="21"/>'
  ),
  createIconComponent(
    'PanelRight',
    ['ui', 'sidebar', 'layout', 'panel'],
    'Right panel icon',
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="15" x2="15" y1="3" y2="21"/>'
  ),

  // Weather
  createIconComponent(
    'Sun',
    ['weather', 'light', 'day', 'bright'],
    'Sun icon',
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'
  ),
  createIconComponent(
    'Moon',
    ['weather', 'night', 'dark', 'mode'],
    'Moon icon',
    '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'
  ),
  createIconComponent(
    'CloudRain',
    ['weather', 'rain', 'precipitation', 'storm'],
    'Rain cloud icon',
    '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/>'
  ),
  createIconComponent(
    'CloudSun',
    ['weather', 'partly-cloudy', 'day'],
    'Partly cloudy icon',
    '<path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>'
  ),
  createIconComponent(
    'Wind',
    ['weather', 'air', 'breeze', 'gust'],
    'Wind icon',
    '<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>'
  ),
  createIconComponent(
    'Thermometer',
    ['weather', 'temperature', 'heat', 'cold'],
    'Thermometer icon',
    '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>'
  ),
  createIconComponent(
    'Umbrella',
    ['weather', 'rain', 'protection', 'cover'],
    'Umbrella icon',
    '<path d="M22 12a10.06 10.06 1 0 0-20 0Z"/><path d="M12 12v8a2 2 0 0 0 4 0"/><path d="M12 2v1"/>'
  ),

  // Development & Tech
  createIconComponent(
    'Cpu',
    ['tech', 'processor', 'chip', 'hardware'],
    'CPU/processor icon',
    '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>'
  ),
  createIconComponent(
    'HardDrive',
    ['tech', 'storage', 'disk', 'server'],
    'Hard drive icon',
    '<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/>'
  ),
  createIconComponent(
    'Server',
    ['tech', 'backend', 'hosting', 'infrastructure'],
    'Server icon',
    '<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>'
  ),
  createIconComponent(
    'Wifi',
    ['tech', 'internet', 'network', 'wireless'],
    'WiFi icon',
    '<path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 20 0"/><line x1="12" x2="12.01" y1="20" y2="20"/>'
  ),
  createIconComponent(
    'WifiOff',
    ['tech', 'internet', 'network', 'disconnected'],
    'WiFi off icon',
    '<line x1="1" x2="23" y1="1" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" x2="12.01" y1="20" y2="20"/>'
  ),
  createIconComponent(
    'Bluetooth',
    ['tech', 'wireless', 'connect', 'pair'],
    'Bluetooth icon',
    '<path d="m7 7 10 10-5 5V2l5 5L7 17"/>'
  ),
  createIconComponent(
    'Battery',
    ['tech', 'power', 'charge', 'energy'],
    'Battery icon',
    '<rect width="16" height="10" x="2" y="7" rx="2" ry="2"/><line x1="22" x2="22" y1="11" y2="13"/>'
  ),
  createIconComponent(
    'BatteryCharging',
    ['tech', 'power', 'charge', 'energy'],
    'Battery charging icon',
    '<path d="M15 7h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2"/><path d="M6 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h1"/><path d="m11 7-3 5h4l-3 5"/><line x1="22" x2="22" y1="11" y2="13"/>'
  ),
  createIconComponent(
    'Smartphone',
    ['tech', 'mobile', 'phone', 'device'],
    'Smartphone icon',
    '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>'
  ),
  createIconComponent(
    'Laptop',
    ['tech', 'computer', 'device', 'notebook'],
    'Laptop icon',
    '<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>'
  ),
  createIconComponent(
    'Monitor',
    ['tech', 'screen', 'display', 'desktop'],
    'Monitor icon',
    '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>'
  ),
  createIconComponent(
    'Keyboard',
    ['tech', 'input', 'typing', 'hardware'],
    'Keyboard icon',
    '<rect width="20" height="16" x="2" y="4" rx="2" ry="2"/><path d="M6 8h.001"/><path d="M10 8h.001"/><path d="M14 8h.001"/><path d="M18 8h.001"/><path d="M8 12h.001"/><path d="M12 12h.001"/><path d="M16 12h.001"/><path d="M7 16h10"/>'
  ),
  createIconComponent(
    'Mouse',
    ['tech', 'input', 'click', 'hardware'],
    'Mouse icon',
    '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/>'
  ),
  createIconComponent(
    'Printer',
    ['tech', 'print', 'output', 'document'],
    'Printer icon',
    '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>'
  ),
  createIconComponent(
    'QrCode',
    ['tech', 'scan', 'barcode', 'code'],
    'QR code icon',
    '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>'
  ),

  // Health & Medical
  createIconComponent(
    'Heart2',
    ['health', 'love', 'medical', 'cardiac'],
    'Heart pulse icon',
    '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>'
  ),
  createIconComponent(
    'Activity',
    ['health', 'pulse', 'heartbeat', 'vitals'],
    'Activity/pulse icon',
    '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>'
  ),
  createIconComponent(
    'Pill',
    ['health', 'medicine', 'drug', 'pharmacy'],
    'Pill icon',
    '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>'
  ),
  createIconComponent(
    'Stethoscope',
    ['health', 'doctor', 'medical', 'checkup'],
    'Stethoscope icon',
    '<path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/>'
  ),
  createIconComponent(
    'Accessibility',
    ['health', 'a11y', 'disability', 'inclusive'],
    'Accessibility icon',
    '<circle cx="16" cy="4" r="1"/><path d="m18 19 1-7-6 1"/><path d="m5 8 3-3 5.5 3-2.36 3.5"/><path d="M4.24 14.5a5 5 0 0 0 6.88 6"/><path d="M13.76 17.5a5 5 0 0 0-6.88-6"/>'
  ),

  // Transport
  createIconComponent(
    'Car',
    ['transport', 'vehicle', 'automobile', 'drive'],
    'Car icon',
    '<path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>'
  ),
  createIconComponent(
    'Plane',
    ['transport', 'flight', 'airplane', 'travel'],
    'Airplane icon',
    '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>'
  ),
  createIconComponent(
    'Train',
    ['transport', 'rail', 'subway', 'metro'],
    'Train icon',
    '<rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/><path d="m8 19-2 3"/><path d="m18 22-2-3"/><path d="M8 15h0"/><path d="M16 15h0"/>'
  ),
  createIconComponent(
    'Bus',
    ['transport', 'vehicle', 'public', 'transit'],
    'Bus icon',
    '<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>'
  ),
  createIconComponent(
    'Bike',
    ['transport', 'bicycle', 'cycle', 'eco'],
    'Bicycle icon',
    '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>'
  ),
  createIconComponent(
    'Ship',
    ['transport', 'boat', 'cruise', 'maritime'],
    'Ship icon',
    '<path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M12 10v4"/><path d="M12 2v3"/>'
  ),
  createIconComponent(
    'Rocket',
    ['transport', 'launch', 'space', 'startup'],
    'Rocket icon',
    '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>'
  ),

  // Arrows Extended
  createIconComponent(
    'ArrowUp',
    ['arrow', 'up', 'direction', 'top'],
    'Arrow up',
    '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>'
  ),
  createIconComponent(
    'ArrowDown',
    ['arrow', 'down', 'direction', 'bottom'],
    'Arrow down',
    '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>'
  ),
  createIconComponent(
    'ArrowUpRight',
    ['arrow', 'diagonal', 'direction', 'northeast'],
    'Arrow up-right',
    '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>'
  ),
  createIconComponent(
    'ArrowDownLeft',
    ['arrow', 'diagonal', 'direction', 'southwest'],
    'Arrow down-left',
    '<path d="M17 7 7 17"/><path d="M17 17H7V7"/>'
  ),
  createIconComponent(
    'ChevronsUp',
    ['arrow', 'double', 'expand', 'top'],
    'Double chevron up',
    '<path d="m17 11-5-5-5 5"/><path d="m17 18-5-5-5 5"/>'
  ),
  createIconComponent(
    'ChevronsDown',
    ['arrow', 'double', 'expand', 'bottom'],
    'Double chevron down',
    '<path d="m7 6 5 5 5-5"/><path d="m7 13 5 5 5-5"/>'
  ),
  createIconComponent(
    'MoveHorizontal',
    ['arrow', 'resize', 'width', 'horizontal'],
    'Move horizontal',
    '<polyline points="18 8 22 12 18 16"/><polyline points="6 8 2 12 6 16"/><line x1="2" x2="22" y1="12" y2="12"/>'
  ),
  createIconComponent(
    'MoveVertical',
    ['arrow', 'resize', 'height', 'vertical'],
    'Move vertical',
    '<polyline points="8 18 12 22 16 18"/><polyline points="8 6 12 2 16 6"/><line x1="12" x2="12" y1="2" y2="22"/>'
  ),

  // Text Formatting
  createIconComponent(
    'Bold',
    ['text', 'formatting', 'font', 'weight'],
    'Bold text',
    '<path d="M14 12a4 4 0 0 0 0-8H6v8"/><path d="M15 20a4 4 0 0 0 0-8H6v8Z"/>'
  ),
  createIconComponent(
    'Italic',
    ['text', 'formatting', 'font', 'slant'],
    'Italic text',
    '<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>'
  ),
  createIconComponent(
    'Underline',
    ['text', 'formatting', 'font', 'decoration'],
    'Underline text',
    '<path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/>'
  ),
  createIconComponent(
    'Strikethrough',
    ['text', 'formatting', 'font', 'delete'],
    'Strikethrough text',
    '<path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" x2="20" y1="12" y2="12"/>'
  ),
  createIconComponent(
    'AlignLeft',
    ['text', 'alignment', 'paragraph', 'justify'],
    'Align left',
    '<line x1="21" x2="3" y1="6" y2="6"/><line x1="15" x2="3" y1="12" y2="12"/><line x1="17" x2="3" y1="18" y2="18"/>'
  ),
  createIconComponent(
    'AlignCenter',
    ['text', 'alignment', 'paragraph', 'justify'],
    'Align center',
    '<line x1="21" x2="3" y1="6" y2="6"/><line x1="17" x2="7" y1="12" y2="12"/><line x1="19" x2="5" y1="18" y2="18"/>'
  ),
  createIconComponent(
    'AlignRight',
    ['text', 'alignment', 'paragraph', 'justify'],
    'Align right',
    '<line x1="21" x2="3" y1="6" y2="6"/><line x1="21" x2="9" y1="12" y2="12"/><line x1="21" x2="7" y1="18" y2="18"/>'
  ),
  createIconComponent(
    'AlignJustify',
    ['text', 'alignment', 'paragraph', 'justify'],
    'Justify text',
    '<line x1="3" x2="21" y1="6" y2="6"/><line x1="3" x2="21" y1="12" y2="12"/><line x1="3" x2="21" y1="18" y2="18"/>'
  ),
  createIconComponent(
    'Type',
    ['text', 'font', 'typography', 'letter'],
    'Type/font icon',
    '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>'
  ),
  createIconComponent(
    'Heading',
    ['text', 'header', 'title', 'h1'],
    'Heading icon',
    '<path d="M6 12h12"/><path d="M6 20V4"/><path d="M18 20V4"/>'
  ),
  createIconComponent(
    'ListOrdered',
    ['text', 'list', 'numbered', 'ol'],
    'Ordered list',
    '<line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>'
  ),
  createIconComponent(
    'Quote',
    ['text', 'blockquote', 'citation', 'reference'],
    'Quote icon',
    '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>'
  ),
  createIconComponent(
    'Link',
    ['text', 'url', 'hyperlink', 'chain'],
    'Link icon',
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'
  ),
  createIconComponent(
    'Unlink',
    ['text', 'url', 'remove', 'chain'],
    'Unlink icon',
    '<path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"/><path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"/><line x1="8" x2="8" y1="2" y2="5"/><line x1="2" x2="5" y1="8" y2="8"/><line x1="16" x2="16" y1="19" y2="22"/><line x1="19" x2="22" y1="16" y2="16"/>'
  ),

  // Shapes
  createIconComponent(
    'Circle',
    ['shape', 'round', 'dot', 'oval'],
    'Circle shape',
    '<circle cx="12" cy="12" r="10"/>'
  ),
  createIconComponent(
    'Square',
    ['shape', 'box', 'rectangle', 'block'],
    'Square shape',
    '<rect width="18" height="18" x="3" y="3" rx="2"/>'
  ),
  createIconComponent(
    'Triangle',
    ['shape', 'polygon', 'arrow', 'warning'],
    'Triangle shape',
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>'
  ),
  createIconComponent(
    'Pentagon',
    ['shape', 'polygon', 'geometric'],
    'Pentagon shape',
    '<path d="M3.5 8.7c-.7.5-1 1.4-.7 2.2l2.8 8.7c.3.8 1 1.4 1.9 1.4h9.1c.9 0 1.6-.6 1.9-1.4l2.8-8.7c.3-.8 0-1.7-.7-2.2l-7.4-5.3a2.1 2.1 0 0 0-2.4 0z"/>'
  ),
  createIconComponent(
    'Hexagon',
    ['shape', 'polygon', 'geometric', 'hex'],
    'Hexagon shape',
    '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>'
  ),
  createIconComponent(
    'Octagon',
    ['shape', 'polygon', 'stop', 'sign'],
    'Octagon shape',
    '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/>'
  ),
];

export const lucideIndex: LibraryIndex = {
  library: lucideLibrary,
  components: lucideIcons,
  lastUpdated: new Date().toISOString(),
  schemaVersion: LIBRARY_SCHEMA_VERSION,
};

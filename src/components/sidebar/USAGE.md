# Sidebar Components Usage

This directory contains a complete set of React components for building a sidebar interface in the Orbit Agent UI.

## Components Overview

### 1. SidebarToggle
Collapse/expand button that toggles the sidebar state.

```tsx
import { SidebarToggle } from '@/components/sidebar';

<SidebarToggle />
```

### 2. SidebarSection
Section wrapper with optional collapsible functionality.

```tsx
import { SidebarSection } from '@/components/sidebar';

<SidebarSection
  title="Workspaces"
  collapsible={true}
  defaultCollapsed={false}
>
  {/* Section content */}
</SidebarSection>
```

### 3. InboxButton
Link to inbox with icon and optional label.

```tsx
import { InboxButton } from '@/components/sidebar';

<InboxButton
  collapsed={false}
  onClick={() => console.log('Navigate to inbox')}
/>
```

### 4. NewConversation
Button to start a new conversation.

```tsx
import { NewConversation } from '@/components/sidebar';

<NewConversation
  collapsed={false}
  onClick={() => console.log('Create new conversation')}
/>
```

### 5. WorkspaceList
Renders a list of workspaces with their conversations.

```tsx
import { WorkspaceList, type Workspace } from '@/components/sidebar';

const workspaces: Workspace[] = [
  {
    id: 'ws-1',
    name: 'Personal',
    conversationIds: ['conv-1', 'conv-2']
  },
  {
    id: 'ws-2',
    name: 'Work',
    conversationIds: ['conv-3']
  }
];

<WorkspaceList workspaces={workspaces} />
```

### 6. WorkspaceItem
Single workspace with expandable conversations.

```tsx
import { WorkspaceItem, ConversationItem } from '@/components/sidebar';

<WorkspaceItem
  id="ws-1"
  name="Personal"
  defaultExpanded={true}
>
  <ConversationItem
    id="conv-1"
    title="My Conversation"
    timestamp={Date.now()}
  />
</WorkspaceItem>
```

### 7. ConversationItem
Individual conversation in the sidebar.

```tsx
import { ConversationItem } from '@/components/sidebar';

<ConversationItem
  id="conv-1"
  title="Chat about React"
  timestamp={Date.now()}
/>
```

### 8. PlaygroundSection
Special section for playground functionality.

```tsx
import { PlaygroundSection } from '@/components/sidebar';

<PlaygroundSection
  collapsed={false}
  onClick={() => console.log('Open playground')}
/>
```

### 9. SidebarUtilities
Bottom utility buttons (Knowledge, Browser, Settings, Feedback).

```tsx
import { SidebarUtilities } from '@/components/sidebar';

<SidebarUtilities
  collapsed={false}
  onKnowledge={() => console.log('Open knowledge')}
  onBrowser={() => console.log('Open browser')}
  onSettings={() => console.log('Open settings')}
  onFeedback={() => console.log('Open feedback')}
/>
```

## Complete Example

Here's a complete sidebar implementation:

```tsx
import { FC } from 'react';
import { useUIStore } from '@/stores/ui-store';
import {
  SidebarToggle,
  SidebarSection,
  InboxButton,
  NewConversation,
  WorkspaceList,
  PlaygroundSection,
  SidebarUtilities,
  type Workspace,
} from '@/components/sidebar';

const workspaces: Workspace[] = [
  {
    id: 'ws-1',
    name: 'Personal Projects',
    conversationIds: ['conv-1', 'conv-2', 'conv-3'],
  },
  {
    id: 'ws-2',
    name: 'Work',
    conversationIds: ['conv-4', 'conv-5'],
  },
];

export const Sidebar: FC = () => {
  const { leftSidebarExpanded } = useUIStore();

  return (
    <aside className="h-full bg-background border-r border-border flex flex-col">
      {/* Header */}
      <div className="h-10 border-b border-border flex items-center justify-between px-2">
        <SidebarToggle />
        {leftSidebarExpanded && <span className="text-sm font-semibold">Orbit Agent</span>}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        <InboxButton collapsed={!leftSidebarExpanded} />
        <NewConversation collapsed={!leftSidebarExpanded} />

        {leftSidebarExpanded && (
          <>
            <SidebarSection title="Workspaces" collapsible={true}>
              <WorkspaceList workspaces={workspaces} />
            </SidebarSection>

            <SidebarSection title="Playground">
              <PlaygroundSection />
            </SidebarSection>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-2">
        <SidebarUtilities
          collapsed={!leftSidebarExpanded}
          onKnowledge={() => console.log('Knowledge')}
          onBrowser={() => console.log('Browser')}
          onSettings={() => console.log('Settings')}
          onFeedback={() => console.log('Feedback')}
        />
      </div>
    </aside>
  );
};
```

## State Management

These components integrate with Zustand stores:

- **useUIStore**: Controls sidebar expand/collapse state
- **useChatStore**: Manages conversations and active conversation state

## Styling

All components use:
- Tailwind CSS for styling
- `cn()` utility for class merging
- Lucide React icons
- Proper TypeScript types with FC and explicit props interfaces

## Responsive Behavior

The sidebar supports two states:
- **Collapsed** (44px width): Shows only icons
- **Expanded** (240px width): Shows icons and labels

Toggle between states using the `SidebarToggle` component or by calling `toggleLeftSidebar()` from the UI store.

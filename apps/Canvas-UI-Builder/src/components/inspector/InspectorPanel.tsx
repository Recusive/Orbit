/**
 * InspectorPanel - Unified component inspector
 *
 * Combines Props editor and CSS Properties editor in a tabbed interface.
 * - Props tab: Edit React component props (variant, size, disabled, etc.)
 * - Styles tab: Edit CSS properties (colors, spacing, typography, etc.)
 */
import { Paintbrush, Settings2 } from 'lucide-react';
import { useState } from 'react';

import { PropertiesPanel } from './PropertiesPanel';
import { PropsEditor } from './PropsEditor';

import type { FC, ReactNode } from 'react';

import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

type InspectorTab = 'props' | 'styles';

export interface InspectorPanelProps {
  /** Selected component name (e.g., 'button', 'input') */
  readonly componentName: string | null;
  /** Current component props */
  readonly props: Record<string, unknown>;
  /** Called when props change */
  readonly onPropsChange: (props: Record<string, unknown>) => void;
}

// ============================================
// Tab Button
// ============================================

interface TabButtonProps {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly icon: ReactNode;
  readonly label: string;
}

const TabButton: FC<TabButtonProps> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    aria-selected={active}
    role="tab"
    className={cn(
      'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
      'border-b-2 -mb-px',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
      active
        ? 'border-primary text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
    )}
  >
    <span aria-hidden="true">{icon}</span>
    {label}
  </button>
);

// ============================================
// Main Component
// ============================================

/**
 * Unified inspector panel with Props and Styles tabs
 */
export const InspectorPanel: FC<InspectorPanelProps> = ({
  componentName,
  props,
  onPropsChange,
}) => {
  const [activeTab, setActiveTab] = useState<InspectorTab>('props');

  // No component selected - show empty state
  if (!componentName) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
        <Settings2 className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">No Component Selected</p>
        <p className="text-xs mt-1 opacity-70">Select a component from the sidebar</p>
      </div>
    );
  }

  // Format component name for display
  const displayName = componentName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border bg-card/50">
        <h2 className="font-medium text-sm text-foreground">{displayName}</h2>
        <p className="text-[10px] text-muted-foreground mt-0.5">Component Inspector</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-border px-1">
        <TabButton
          active={activeTab === 'props'}
          onClick={() => {
            setActiveTab('props');
          }}
          icon={<Settings2 className="h-3.5 w-3.5" />}
          label="Props"
        />
        <TabButton
          active={activeTab === 'styles'}
          onClick={() => {
            setActiveTab('styles');
          }}
          icon={<Paintbrush className="h-3.5 w-3.5" />}
          label="Styles"
        />
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'props' ? (
          <div className="h-full overflow-y-auto">
            <PropsEditor componentName={componentName} props={props} onChange={onPropsChange} />
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            <PropertiesPanel selectedComponentName={componentName} />
          </div>
        )}
      </div>
    </div>
  );
};

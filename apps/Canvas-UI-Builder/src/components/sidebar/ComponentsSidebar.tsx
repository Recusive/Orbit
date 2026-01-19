'use client';

import { CATEGORY, HEADER, LOGO, PANEL } from '@canvas/lib/constants';
import {
  BarChart3,
  ChevronRight,
  CreditCard,
  FlaskConical,
  Grid3X3,
  Image,
  KeyRound,
  Layers,
  LayoutGrid,
  LayoutList,
  ListChecks,
  Lock,
  LogIn,
  PanelLeft,
  Receipt,
  RectangleHorizontal,
  Settings,
  Settings2,
  SplitSquareHorizontal,
  Square,
  SquareStack,
  Table,
  ToggleLeft,
  User,
  UserPlus,
} from 'lucide-react';
import { useCallback, useState } from 'react';

import { TabSwitcher } from '../header/TabSwitcher';

import type { LucideIcon } from 'lucide-react';
import type { FC, ReactNode } from 'react';

import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

interface ComponentItem {
  readonly label: string;
  readonly icon: LucideIcon;
}

interface ComponentCategory {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly items: readonly ComponentItem[];
}

interface CollapsibleCategoryProps {
  readonly category: ComponentCategory;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
}

// ============================================
// Constants
// ============================================

const SIDEBAR_TABS = [
  { id: 'components', label: 'Components' },
  { id: 'blocks', label: 'Blocks' },
] as const;

const COMPONENT_CATEGORIES: readonly ComponentCategory[] = [
  {
    id: 'layout',
    label: 'Layout',
    icon: <LayoutGrid className={CATEGORY.icon.size} />,
    items: [
      { label: 'Container', icon: Square },
      { label: 'Grid', icon: Grid3X3 },
      { label: 'Flex', icon: SplitSquareHorizontal },
      { label: 'Stack', icon: SquareStack },
      { label: 'Divider', icon: RectangleHorizontal },
    ],
  },
  {
    id: 'display',
    label: 'Display',
    icon: <Layers className={CATEGORY.icon.size} />,
    items: [
      { label: 'Card', icon: CreditCard },
      { label: 'Badge', icon: RectangleHorizontal },
      { label: 'Avatar', icon: User },
      { label: 'Image', icon: Image },
      { label: 'Icon', icon: Square },
    ],
  },
  {
    id: 'auth',
    label: 'Auth',
    icon: <Lock className={CATEGORY.icon.size} />,
    items: [
      { label: 'Login Form', icon: LogIn },
      { label: 'Sign Up', icon: UserPlus },
      { label: 'Password Reset', icon: KeyRound },
      { label: 'OAuth Buttons', icon: LayoutList },
    ],
  },
  {
    id: 'pricing',
    label: 'Pricing',
    icon: <Receipt className={CATEGORY.icon.size} />,
    items: [
      { label: 'Pricing Card', icon: CreditCard },
      { label: 'Comparison Table', icon: Table },
      { label: 'Feature List', icon: ListChecks },
      { label: 'Toggle', icon: ToggleLeft },
    ],
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <Settings className={CATEGORY.icon.size} />,
    items: [
      { label: 'Stats Card', icon: BarChart3 },
      { label: 'Chart', icon: BarChart3 },
      { label: 'Table', icon: Table },
      { label: 'Sidebar Nav', icon: PanelLeft },
    ],
  },
] as const;

// ============================================
// Sub-components
// ============================================

/**
 * Icon tile for a component item.
 * Displays an icon with gradient background and label below.
 */
interface ComponentTileProps {
  readonly item: ComponentItem;
}

const ComponentTile: FC<ComponentTileProps> = ({ item }) => {
  const Icon = item.icon;
  return (
    <button
      type="button"
      className="flex flex-col items-center justify-center gap-1 p-1.5 rounded hover:bg-muted/50 transition-colors group"
      style={{ width: 'calc(50% - 4px)' }}
    >
      {/* Icon container with gradient background */}
      <div
        className="w-6 h-6 rounded flex items-center justify-center border shrink-0"
        style={{
          background:
            'linear-gradient(135deg, rgba(224, 122, 107, 0.2) 0%, rgba(196, 169, 139, 0.15) 100%)',
          borderColor: 'rgba(224, 122, 107, 0.25)',
        }}
      >
        <Icon className="h-3 w-3" strokeWidth={1.5} style={{ color: 'rgb(224, 122, 107)' }} />
      </div>
      {/* Label */}
      <span className="text-[9px] text-muted-foreground group-hover:text-foreground transition-colors text-center leading-tight line-clamp-1">
        {item.label}
      </span>
    </button>
  );
};

/**
 * A collapsible category in the component sidebar.
 * Shows category label with expand/collapse chevron.
 * Items are displayed as icon tiles in a 2-column grid.
 */
const CollapsibleCategory: FC<CollapsibleCategoryProps> = ({ category, isExpanded, onToggle }) => {
  return (
    <div className={cn(CATEGORY.wrapper.border, CATEGORY.wrapper.borderLast)}>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-2',
          CATEGORY.button.padding,
          CATEGORY.button.fontSize,
          CATEGORY.button.fontWeight,
          CATEGORY.button.color,
          CATEGORY.button.hover,
          'transition-colors'
        )}
      >
        <ChevronRight
          className={cn(CATEGORY.chevron.size, CATEGORY.chevron.color)}
          style={{
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 200ms ease-out',
          }}
        />
        {category.icon}
        <span>{category.label}</span>
      </button>

      {isExpanded ? (
        <div className="flex flex-wrap gap-2 px-3 pb-3">
          {category.items.map((item) => (
            <ComponentTile key={item.label} item={item} />
          ))}
        </div>
      ) : null}
    </div>
  );
};

// ============================================
// Main Component
// ============================================

/**
 * Left sidebar showing component categories.
 * Categories are collapsible with nested component items.
 */
export const ComponentsSidebar: FC = () => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = useCallback((categoryId: string): void => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  return (
    <div className={cn('h-full flex flex-col', PANEL.sidebar.background)}>
      {/* Logo */}
      <div className={cn('flex items-center', HEADER.height, HEADER.paddingSidebar, HEADER.border)}>
        <div className={cn('flex items-center', LOGO.gap)}>
          <span className={cn(LOGO.title.fontSize, LOGO.title.fontWeight, LOGO.title.whitespace)}>
            Orbit Canvas
          </span>
          <span
            className={cn(
              LOGO.badge.background,
              LOGO.badge.color,
              LOGO.badge.borderRadius,
              LOGO.badge.padding,
              LOGO.badge.fontWeight,
              LOGO.badge.tracking,
              LOGO.badge.whitespace
            )}
            style={{ fontSize: LOGO.badge.fontSize }}
          >
            Preview
          </span>
        </div>
      </div>

      {/* Section Tabs */}
      <div className={cn('flex items-center', HEADER.height, HEADER.paddingSidebar)}>
        <TabSwitcher
          tabs={SIDEBAR_TABS}
          defaultTab="components"
          fullWidth
          onChange={(): void => {
            // TODO: Switch between components and blocks view
          }}
        />
      </div>

      {/* Categories */}
      <ScrollArea className="flex-1">
        <div className={CATEGORY.list.padding}>
          {COMPONENT_CATEGORIES.map((category) => (
            <CollapsibleCategory
              key={category.id}
              category={category}
              isExpanded={expandedCategories.has(category.id)}
              onToggle={(): void => {
                toggleCategory(category.id);
              }}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Settings & Feedback */}
      <div className="flex flex-col shrink-0 gap-1 py-1.5 border-t border-border">
        <button
          type="button"
          className="flex items-center h-8 rounded-lg mx-1.5 overflow-hidden hover:bg-muted/50 active:scale-[0.98] transition-[background-color,color,transform] duration-200 text-muted-foreground hover:text-foreground"
        >
          {/* Fixed-width icon column (35px - 12px padding = 23px) */}
          <div className="flex items-center justify-center shrink-0" style={{ width: 23 }}>
            <Settings2 className="shrink-0 h-4 w-4" />
          </div>
          <span className="text-base whitespace-nowrap overflow-hidden">Settings</span>
          <KbdGroup className="ml-auto mr-2">
            <Kbd className="bg-foreground/10 text-inherit border-foreground/15">⌘</Kbd>
            <Kbd className="bg-foreground/10 text-inherit border-foreground/15">,</Kbd>
          </KbdGroup>
        </button>
        <button
          type="button"
          className="flex items-center h-8 rounded-lg mx-1.5 overflow-hidden hover:bg-muted/50 active:scale-[0.98] transition-[background-color,color,transform] duration-200 text-muted-foreground hover:text-foreground"
        >
          {/* Fixed-width icon column (35px - 12px padding = 23px) */}
          <div className="flex items-center justify-center shrink-0" style={{ width: 23 }}>
            <FlaskConical className="shrink-0 h-4 w-4" />
          </div>
          <span className="text-base whitespace-nowrap overflow-hidden">Feedback</span>
        </button>
      </div>
    </div>
  );
};

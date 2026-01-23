import React, { useEffect, useRef, useState } from 'react';

export interface ContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  nodeId?: string;
}

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
  divider?: boolean;
}

interface ContextMenuProps {
  menuState: ContextMenuState;
  items: ContextMenuItem[];
  onClose: () => void;
}

const styles = {
  menu: {
    position: 'fixed' as const,
    zIndex: 9999,
    minWidth: '200px',
    backgroundColor: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
    overflow: 'hidden',
    animation: 'fadeIn 0.1s ease-out',
  },
  menuContent: {
    padding: '4px 0',
  },
  divider: {
    margin: '4px 0',
    borderTop: '1px solid var(--border)',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '8px 12px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--foreground)',
    fontSize: '13px',
    textAlign: 'left' as const,
    cursor: 'pointer',
    transition: 'background-color 0.1s',
  },
  menuItemDisabled: {
    color: 'var(--muted-foreground)',
    cursor: 'not-allowed',
  },
  menuItemHover: {
    backgroundColor: 'var(--accent)',
  },
  menuItemLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  menuItemIcon: {
    width: '16px',
    height: '16px',
    color: 'var(--muted-foreground)',
  },
  menuItemShortcut: {
    fontSize: '12px',
    color: 'var(--muted-foreground)',
    marginLeft: '16px',
  },
};

// Add keyframe animation via style tag
const styleSheet = `
@keyframes fadeIn {
	from {
		opacity: 0;
		transform: scale(0.95);
	}
	to {
		opacity: 1;
		transform: scale(1);
	}
}
`;

export function ContextMenu({
  menuState,
  items,
  onClose,
}: ContextMenuProps): React.JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(menuState.position);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Inject animation styles
  useEffect(() => {
    const existingStyle = document.getElementById('context-menu-styles');
    if (!existingStyle) {
      const style = document.createElement('style');
      style.id = 'context-menu-styles';
      style.textContent = styleSheet;
      document.head.appendChild(style);
    }
  }, []);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!menuState.isOpen || !menuRef.current) return;

    const menu = menuRef.current;
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let { x, y } = menuState.position;

    // Adjust horizontal position if menu goes off screen
    if (x + menuRect.width > viewportWidth) {
      x = viewportWidth - menuRect.width - 8;
    }

    // Adjust vertical position if menu goes off screen
    if (y + menuRect.height > viewportHeight) {
      y = viewportHeight - menuRect.height - 8;
    }

    // Ensure minimum position
    x = Math.max(8, x);
    y = Math.max(8, y);

    setAdjustedPosition({ x, y });
  }, [menuState.isOpen, menuState.position]);

  // Note: Escape key is handled globally by useCanvasShortcuts

  // Close on click outside
  useEffect(() => {
    if (!menuState.isOpen) return;

    const handleClickOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Use setTimeout to avoid immediately closing on the same click that opened it
    // Use capture phase (third arg = true) to catch events before ReactFlow can stop propagation
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [menuState.isOpen, onClose]);

  // Early return AFTER all hooks
  if (!menuState.isOpen) return null;

  return (
    <div
      ref={menuRef}
      style={{
        ...styles.menu,
        left: `${String(adjustedPosition.x)}px`,
        top: `${String(adjustedPosition.y)}px`,
      }}
      onClick={(e): void => {
        e.stopPropagation();
      }}
    >
      <div style={styles.menuContent}>
        {items.map((item, index) => {
          if (item.divider) {
            return <div key={`divider-${String(index)}`} style={styles.divider} />;
          }

          return (
            <button
              key={`${item.label}-${String(index)}`}
              onClick={(e): void => {
                e.stopPropagation();
                if (!item.disabled) {
                  item.action();
                  onClose();
                }
              }}
              disabled={item.disabled}
              onMouseEnter={(): void => {
                setHoveredIndex(index);
              }}
              onMouseLeave={(): void => {
                setHoveredIndex(null);
              }}
              style={{
                ...styles.menuItem,
                ...(item.disabled ? styles.menuItemDisabled : {}),
                ...(hoveredIndex === index && !item.disabled ? styles.menuItemHover : {}),
              }}
            >
              <div style={styles.menuItemLeft}>
                {item.icon !== undefined ? (
                  <span style={styles.menuItemIcon}>{item.icon}</span>
                ) : null}
                <span>{item.label}</span>
              </div>
              {item.shortcut !== undefined ? (
                <span style={styles.menuItemShortcut}>{item.shortcut}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

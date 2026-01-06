import React from 'react';

interface ShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

// SVG Icon
const CloseIcon = (): React.JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

// Detect Mac for keyboard shortcuts display
const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toUpperCase().includes('MAC');
const modKey = isMac ? '⌘' : 'Ctrl';

const shortcuts = [
  {
    category: 'General',
    items: [
      { shortcut: `${modKey} + K`, description: 'Open command palette' },
      { shortcut: `${modKey} + S`, description: 'Save canvas' },
      { shortcut: 'Shift + ?', description: 'Show keyboard shortcuts' },
      { shortcut: 'Esc', description: 'Close dialogs / Cancel' },
    ],
  },
  {
    category: 'Canvas',
    items: [
      { shortcut: 'Double-click', description: 'Add component menu' },
      { shortcut: 'Right-click', description: 'Context menu' },
      { shortcut: 'Scroll', description: 'Pan canvas' },
      { shortcut: `${modKey} + Scroll`, description: 'Zoom in/out' },
    ],
  },
  {
    category: 'Editing',
    items: [
      { shortcut: `${modKey} + Z`, description: 'Undo' },
      { shortcut: `${modKey} + Shift + Z`, description: 'Redo' },
      { shortcut: `${modKey} + Y`, description: 'Redo (alternative)' },
      { shortcut: 'Double-click text', description: 'Edit inline' },
    ],
  },
  {
    category: 'Selection',
    items: [
      { shortcut: `${modKey} + A`, description: 'Select all nodes' },
      { shortcut: 'Click + Drag', description: 'Lasso selection' },
      { shortcut: 'Shift + Click', description: 'Add to selection' },
      { shortcut: `${modKey} + Click`, description: 'Toggle selection' },
    ],
  },
  {
    category: 'Actions',
    items: [
      { shortcut: `${modKey} + D`, description: 'Duplicate selected' },
      { shortcut: `${modKey} + C`, description: 'Copy selected' },
      { shortcut: `${modKey} + V`, description: 'Paste' },
      { shortcut: 'Del', description: 'Delete selected' },
      { shortcut: 'Backspace', description: 'Delete selected' },
    ],
  },
  {
    category: 'Panels',
    items: [
      { shortcut: `${modKey} + B`, description: 'Toggle code panel' },
      { shortcut: `${modKey} + P`, description: 'Toggle preview panel' },
      { shortcut: `${modKey} + \\`, description: 'Toggle properties panel' },
    ],
  },
  {
    category: 'Element Editing',
    items: [
      { shortcut: `${modKey} + Shift + ↑`, description: 'Move element up' },
      { shortcut: `${modKey} + Shift + ↓`, description: 'Move element down' },
      { shortcut: `${modKey} + Shift + D`, description: 'Duplicate element' },
      { shortcut: `${modKey} + Shift + W`, description: 'Wrap in container' },
      { shortcut: `${modKey} + ⌫`, description: 'Delete element' },
    ],
  },
];

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(4px)',
  },
  modal: {
    position: 'relative' as const,
    width: '100%',
    maxWidth: '800px',
    maxHeight: '80vh',
    backgroundColor: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
    overflow: 'hidden',
    margin: '0 16px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    borderBottom: '1px solid var(--border)',
  },
  headerContent: {},
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--foreground)',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--muted-foreground)',
    margin: '4px 0 0 0',
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    padding: 0,
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    transition: 'all 0.1s',
  },
  content: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '24px',
    padding: '24px',
    maxHeight: 'calc(80vh - 140px)',
    overflowY: 'auto' as const,
  },
  section: {},
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: 'var(--foreground)',
    opacity: 0.7,
    marginBottom: '12px',
  },
  shortcutList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  shortcutItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },
  shortcutKey: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    fontSize: '12px',
    fontFamily: 'monospace',
    fontWeight: 500,
    backgroundColor: 'var(--input)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: 'var(--foreground)',
    whiteSpace: 'nowrap' as const,
  },
  shortcutDescription: {
    fontSize: '13px',
    color: 'var(--muted-foreground)',
  },
  footer: {
    padding: '12px 24px',
    borderTop: '1px solid var(--border)',
    backgroundColor: 'var(--muted)',
  },
  footerText: {
    fontSize: '12px',
    color: 'var(--muted-foreground)',
    margin: 0,
  },
  footerKey: {
    display: 'inline-block',
    padding: '2px 6px',
    marginRight: '4px',
    fontSize: '11px',
    fontFamily: 'monospace',
    backgroundColor: 'var(--input)',
    border: '1px solid var(--border)',
    borderRadius: '3px',
    color: 'var(--foreground)',
  },
};

export function ShortcutsHelp({ isOpen, onClose }: ShortcutsHelpProps): React.JSX.Element | null {
  // Note: Escape key is handled globally by useCanvasShortcuts

  if (!isOpen) return null;

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div
        style={styles.modal}
        onClick={(e): void => {
          e.stopPropagation();
        }}
      >
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerContent}>
            <h2 style={styles.title}>Keyboard Shortcuts</h2>
            <p style={styles.subtitle}>Quick reference for all keyboard shortcuts</p>
          </div>
          <button
            onClick={onClose}
            style={styles.closeButton}
            onMouseEnter={(e): void => {
              e.currentTarget.style.backgroundColor = 'var(--accent)';
              e.currentTarget.style.color = 'var(--foreground)';
            }}
            onMouseLeave={(e): void => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--muted-foreground)';
            }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {shortcuts.map((section) => (
            <div key={section.category} style={styles.section}>
              <h3 style={styles.sectionTitle}>{section.category}</h3>
              <div style={styles.shortcutList}>
                {section.items.map((item, index) => (
                  <div key={index} style={styles.shortcutItem}>
                    <span style={styles.shortcutDescription}>{item.description}</span>
                    <kbd style={styles.shortcutKey}>{item.shortcut}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <p style={styles.footerText}>
            Press <kbd style={styles.footerKey}>Esc</kbd> to close
          </p>
        </div>
      </div>
    </div>
  );
}

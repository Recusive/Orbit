import React from 'react';

interface PanelToggleProps {
  isVisible: boolean;
  onToggle: () => void;
  label: string;
  icon?: React.ReactNode;
  className?: string;
}

export const PanelToggle: React.FC<PanelToggleProps> = ({
  isVisible,
  onToggle,
  label,
  icon,
  className = '',
}) => {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded hover:bg-accent transition-colors ${className}`}
      aria-label={`${isVisible ? 'Hide' : 'Show'} ${label}`}
      aria-pressed={isVisible}
      title={`${isVisible ? 'Hide' : 'Show'} ${label}`}
    >
      {icon !== undefined ? <span className="w-4 h-4">{icon}</span> : null}
      <span className="font-medium">{label}</span>
      <span className="ml-auto text-xs text-muted-foreground">{isVisible ? '◀' : '▶'}</span>
    </button>
  );
};

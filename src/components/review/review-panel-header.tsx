import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import React from 'react';

export interface ReviewPanelHeaderProps {
  onBack?: () => void;
  onForward?: () => void;
  onFind?: () => void;
  onClose: () => void;
  title?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

export const ReviewPanelHeader: React.FC<ReviewPanelHeaderProps> = ({
  onBack,
  onForward,
  onFind,
  onClose,
  title = 'Review Changes',
  canGoBack = false,
  canGoForward = false,
}) => {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
      {/* Left: Navigation arrows */}
      <div className="flex items-center gap-1">
        <button
          onClick={onBack}
          disabled={!canGoBack}
          className={`
            p-1.5 rounded hover:bg-gray-100
            transition-colors
            ${!canGoBack ? 'opacity-30 cursor-not-allowed' : ''}
          `}
          aria-label="Go back"
        >
          <ChevronLeft className="h-4 w-4 text-gray-700" />
        </button>
        <button
          onClick={onForward}
          disabled={!canGoForward}
          className={`
            p-1.5 rounded hover:bg-gray-100
            transition-colors
            ${!canGoForward ? 'opacity-30 cursor-not-allowed' : ''}
          `}
          aria-label="Go forward"
        >
          <ChevronRight className="h-4 w-4 text-gray-700" />
        </button>
      </div>

      {/* Center: Title */}
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>

      {/* Right: Find and close */}
      <div className="flex items-center gap-1">
        {onFind ? <button
            onClick={onFind}
            className="p-1.5 rounded hover:bg-gray-100 transition-colors"
            aria-label="Find in changes"
          >
            <Search className="h-4 w-4 text-gray-700" />
          </button> : null}
        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-gray-100 transition-colors"
          aria-label="Close review panel"
        >
          <X className="h-4 w-4 text-gray-700" />
        </button>
      </div>
    </div>
  );
};

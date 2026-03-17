import { ArrowRight, Sparkles, Zap } from 'lucide-react';

import type { FC } from 'react';

import { OrbitLogo } from '@/components/icons/orbit-logo';
import { cn } from '@/lib/utils';

export interface WelcomeStepProps {
  readonly onContinue: () => void;
  readonly className?: string;
}

/**
 * Welcome screen shown on first launch.
 * Displays Orbit branding and a "Get Started" button.
 * Uses liquid-glass design tokens matching macOS 26 UI Kit spec.
 */
export const WelcomeStep: FC<WelcomeStepProps> = ({ onContinue, className }) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center h-full w-full',
        'mx-auto box-border bg-background',
        className
      )}
    >
      <div className="relative flex flex-col items-center w-full max-w-[360px]" style={{ gap: 16 }}>
        {/* Icon */}
        <div className="flex w-full items-center" style={{ padding: '0 6px' }}>
          <div className="liquid-glass-icon flex shrink-0 items-center justify-center bg-primary/10">
            <OrbitLogo size={40} className="text-primary" />
          </div>
        </div>

        {/* Title + Description */}
        <div className="flex w-full flex-col items-start" style={{ padding: '0 6px 2px', gap: 10 }}>
          <h1 className="liquid-glass-title w-full">Welcome to Orbit</h1>
          <p className="liquid-glass-desc w-full">
            AI-powered coding assistance directly in your editor. Let&apos;s get you set up.
          </p>
        </div>

        {/* Feature highlights */}
        <div className="flex w-full flex-col" style={{ padding: '0 6px', gap: 8 }}>
          <div className="flex items-center gap-2.5 text-sm text-foreground/80">
            <Sparkles className="h-3.5 w-3.5 text-foreground/60 shrink-0" aria-hidden="true" />
            <span>Intelligent code completion</span>
          </div>
          <div className="flex items-center gap-2.5 text-sm text-foreground/80">
            <Zap className="h-3.5 w-3.5 text-foreground/60 shrink-0" aria-hidden="true" />
            <span>Natural language to code</span>
          </div>
        </div>

        {/* Get Started Button */}
        <div className="flex w-full items-center" style={{ padding: '0 6px' }}>
          <button
            type="button"
            className="liquid-glass-btn liquid-glass-btn-primary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97] flex items-center justify-center gap-2"
            onClick={onContinue}
          >
            Get Started
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

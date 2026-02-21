import { ArrowRight, Sparkles, Zap } from 'lucide-react';

import type { FC } from 'react';

import { OrbitLogo } from '@/components/icons/orbit-logo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface WelcomeStepProps {
  readonly onContinue: () => void;
  readonly className?: string;
}

/**
 * Welcome screen shown on first launch.
 * Displays Orbit branding and a "Get Started" button.
 * Matches the agent UI design system with compact, left-aligned layout.
 */
export const WelcomeStep: FC<WelcomeStepProps> = ({ onContinue, className }) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center h-full w-full',
        'min-w-[420px] mx-auto p-12 gap-6 box-border',
        'bg-background',
        className
      )}
    >
      {/* Logo/Branding */}
      <div className="flex items-center gap-4 w-full max-w-[380px]">
        <div className="flex items-center justify-center w-14 h-14 rounded-lg bg-foreground/8">
          <OrbitLogo size={40} className="text-foreground" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-2xl font-semibold text-foreground tracking-tight">Orbit</span>
          <span className="text-sm text-muted-foreground">AI Code Editor</span>
        </div>
      </div>

      {/* Welcome Card */}
      <div
        className={cn(
          'flex flex-col gap-4 p-5 rounded-lg w-full max-w-[380px]',
          'bg-lg-control border border-border'
        )}
      >
        <div className="flex flex-col gap-1.5">
          <h1 className="text-base font-medium text-foreground">Welcome</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Orbit brings AI-powered coding assistance directly into your editor. Let&apos;s get you
            set up.
          </p>
        </div>

        {/* Feature highlights - compact list */}
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center gap-2.5 text-sm text-foreground/80">
            <Sparkles className="h-3.5 w-3.5 text-foreground/60 shrink-0" />
            <span>Intelligent code completion</span>
          </div>
          <div className="flex items-center gap-2.5 text-sm text-foreground/80">
            <Zap className="h-3.5 w-3.5 text-foreground/60 shrink-0" />
            <span>Natural language to code</span>
          </div>
        </div>
      </div>

      {/* Get Started Button */}
      <Button
        onClick={onContinue}
        className={cn(
          'w-full max-w-[380px] h-10 text-sm font-medium',
          'bg-foreground text-background hover:bg-foreground/90'
        )}
      >
        Get Started
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );
};

import { Orbit } from 'lucide-react';

import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface WelcomeStepProps {
  readonly onContinue: () => void;
  readonly className?: string;
}

/**
 * Welcome screen shown on first launch.
 * Displays Orbit branding and a "Get Started" button.
 */
export const WelcomeStep: FC<WelcomeStepProps> = ({ onContinue, className }) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center h-full w-full',
        'bg-background',
        className
      )}
    >
      <div className="flex flex-col items-center gap-8 max-w-md text-center">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 rounded-2xl bg-primary/10">
            <Orbit className="h-16 w-16 text-primary" />
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold text-foreground">Welcome to Orbit</h1>
            <p className="text-muted-foreground text-base">
              The AI-powered code editor for modern developers.
            </p>
          </div>
        </div>

        {/* Get Started Button */}
        <Button size="lg" onClick={onContinue} className="px-8 py-3 text-base font-medium">
          Get Started
        </Button>
      </div>
    </div>
  );
};

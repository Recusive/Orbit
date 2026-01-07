import { useCallback } from 'react';

import { ProviderStep } from './ProviderStep';
import { WelcomeStep } from './WelcomeStep';

import type { FC } from 'react';

import { cn } from '@/lib/utils';
import { useOnboardingStore } from '@/stores/onboarding/onboarding-store';

export interface OnboardingFlowProps {
  readonly className?: string;
}

/**
 * Main onboarding flow orchestrator.
 * Manages step transitions and renders the appropriate step component.
 */
export const OnboardingFlow: FC<OnboardingFlowProps> = ({ className }) => {
  const currentStep = useOnboardingStore((s) => s.currentStep);
  const setStep = useOnboardingStore((s) => s.setStep);
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);

  // Handle welcome step completion
  const handleWelcomeContinue = useCallback((): void => {
    setStep('provider');
  }, [setStep]);

  // Handle provider step completion
  const handleProviderComplete = useCallback((): void => {
    completeOnboarding();
  }, [completeOnboarding]);

  return (
    <div className={cn('h-screen w-screen overflow-hidden', 'bg-background', className)}>
      {currentStep === 'welcome' ? <WelcomeStep onContinue={handleWelcomeContinue} /> : null}
      {currentStep === 'provider' ? <ProviderStep onComplete={handleProviderComplete} /> : null}
      {/* 'complete' step triggers main app render via hasCompletedOnboarding */}
    </div>
  );
};

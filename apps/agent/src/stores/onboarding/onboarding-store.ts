import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

/**
 * Onboarding step in the setup flow.
 */
export type OnboardingStep = 'welcome' | 'provider' | 'complete';

/**
 * Onboarding state for tracking first-launch setup.
 */
interface OnboardingState {
  /** Whether the user has completed the onboarding flow */
  hasCompletedOnboarding: boolean;
  /** Current step in the onboarding flow */
  currentStep: OnboardingStep;
}

/**
 * Onboarding store actions.
 */
interface OnboardingActions {
  /** Set the current onboarding step */
  setStep: (step: OnboardingStep) => void;
  /** Mark onboarding as complete and transition to main app */
  completeOnboarding: () => void;
  /** Reset onboarding state (for testing or re-setup) */
  resetOnboarding: () => void;
}

const initialState: OnboardingState = {
  hasCompletedOnboarding: false,
  currentStep: 'welcome',
};

/**
 * Store for managing onboarding/first-launch flow state.
 * Persisted to localStorage to remember if user has completed setup.
 */
export const useOnboardingStore = create<OnboardingState & OnboardingActions>()(
  persist(
    immer((set) => ({
      ...initialState,

      setStep: (step): void => {
        set((state) => {
          state.currentStep = step;
        });
      },

      completeOnboarding: (): void => {
        set((state) => {
          state.hasCompletedOnboarding = true;
          state.currentStep = 'complete';
        });
      },

      resetOnboarding: (): void => {
        set((state) => {
          state.hasCompletedOnboarding = false;
          state.currentStep = 'welcome';
        });
      },
    })),
    {
      name: 'orbit-onboarding',
      // Only persist the completion status, not the current step
      partialize: (state) => ({
        hasCompletedOnboarding: state.hasCompletedOnboarding,
      }),
    }
  )
);

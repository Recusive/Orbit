import type { FC } from 'react';

import { AccountBanner } from '@/components/welcome/account-banner';
import { OrbitAsciiLogo } from '@/components/welcome/orbit-ascii-logo';
import { cn } from '@/lib/utils';

export interface WelcomePageProps {
  className?: string;
  /** When false, ASCII art is not rendered (container remains for layout). */
  showAscii?: boolean | undefined;
  /** Fires once when the ASCII beam/scramble animation completes. */
  onAsciiAnimationComplete?: (() => void) | undefined;
  /** When true, defers the account toast until the launch sequence finishes. */
  deferToast?: boolean | undefined;
}

/**
 * Welcome page shown on startup when no workspace is open.
 * Displays branding and account status.
 * Action buttons and recent projects are rendered in PrimarySidebar when in welcome mode.
 */
export const WelcomePage: FC<WelcomePageProps> = ({
  className,
  showAscii,
  onAsciiAnimationComplete,
  deferToast,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center h-full w-full gap-10',
        'select-none',
        className
      )}
    >
      {/* Hero — ASCII block art wordmark */}
      <OrbitAsciiLogo showAscii={showAscii} onAnimationComplete={onAsciiAnimationComplete} />

      {/* Account Status Banner */}
      <AccountBanner deferToast={deferToast} />
    </div>
  );
};

import type { FC } from 'react';

import { AccountBanner } from '@/components/welcome/account-banner';
import { OrbitAsciiLogo } from '@/components/welcome/orbit-ascii-logo';
import { cn } from '@/lib/utils';

export interface WelcomePageProps {
  className?: string;
}

/**
 * Welcome page shown on startup when no workspace is open.
 * Displays branding and account status.
 * Action buttons and recent projects are rendered in PrimarySidebar when in welcome mode.
 */
export const WelcomePage: FC<WelcomePageProps> = ({ className }) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center h-full w-full gap-10',
        'select-none',
        className
      )}
    >
      {/* Hero — ASCII block art wordmark */}
      <OrbitAsciiLogo />

      {/* Account Status Banner */}
      <AccountBanner />
    </div>
  );
};

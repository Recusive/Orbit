/**
 * OrbitAsciiLogo — Welcome page branding with beam reveal animation.
 *
 * Uses the shared BeamAsciiPre component for the sweep effect,
 * with a tagline that fades in after the beam completes.
 */
import type { FC } from 'react';

import { BeamAsciiPre } from '@/components/shared';
import { cn } from '@/lib/utils';

interface OrbitAsciiLogoProps {
  readonly className?: string;
}

const ORBIT_ART = ` ██████╗ ██████╗ ██████╗ ██╗████████╗
██╔═══██╗██╔══██╗██╔══██╗██║╚══██╔══╝
██║   ██║██████╔╝██████╔╝██║   ██║
██║   ██║██╔══██╗██╔══██╗██║   ██║
╚██████╔╝██║  ██║██████╔╝██║   ██║
 ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚═╝   ╚═╝`;

const TAGLINE = 'One workspace. Agent, editor, canvas.';

export const OrbitAsciiLogo: FC<OrbitAsciiLogoProps> = ({ className }) => {
  return (
    <div className={cn('flex flex-col items-center', className)}>
      <BeamAsciiPre
        text={ORBIT_ART}
        ariaLabel="ORBIT"
        className="text-[22px] leading-[1.15]"
        duration={2400}
      />

      {/* Tagline — beam starts after the main art finishes */}
      <div className="h-6 mt-3">
        <BeamAsciiPre
          text={TAGLINE}
          ariaLabel="One workspace. Agent, editor, canvas."
          className="text-sm leading-normal text-center"
          duration={1200}
          beamSize={8}
          blurLead={6}
          delay={2400}
          settledColor="var(--foreground)"
        />
      </div>
    </div>
  );
};

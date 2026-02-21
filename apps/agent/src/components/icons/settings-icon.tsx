import { forwardRef } from 'react';

import type { SVGProps } from 'react';

interface SettingsIconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

/**
 * SettingsIcon - Gear/cog icon traced from the original base64 PNG asset.
 * Usage: <SettingsIcon size={18} className="text-muted-foreground" />
 */
const SettingsIcon = forwardRef<SVGSVGElement, SettingsIconProps>(
  ({ size = 18, color = 'currentColor', className, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill={color}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <g transform="translate(0,96) scale(0.1,-0.1)" stroke="none">
        <path d="M383 849 c-8 -41 -45 -59 -71 -36 -33 30 -51 21 -54 -25 l-3 -43 -49 -3 -48 -3 6 -41 c8 -46 -5 -68 -39 -68 -12 0 -28 -6 -35 -14 -9 -12 -7 -18 9 -33 31 -26 28 -69 -6 -85 -16 -7 -28 -20 -28 -28 0 -8 12 -21 28 -28 33 -16 35 -44 6 -80 -19 -25 -19 -27 -3 -39 10 -7 28 -13 40 -13 28 0 36 -21 27 -72 l-6 -41 34 5 c49 8 69 -6 69 -47 0 -43 14 -51 47 -30 31 21 73 7 73 -24 0 -10 7 -25 16 -32 14 -12 19 -10 38 14 28 34 59 34 84 0 17 -23 22 -25 35 -15 8 7 18 24 21 37 8 32 39 40 71 19 31 -20 54 -6 48 29 -7 35 20 57 62 50 27 -4 36 -2 41 11 4 10 2 22 -5 29 -23 23 -2 69 33 73 6 0 17 2 24 2 19 3 14 37 -7 56 -24 22 -16 52 19 69 14 7 25 19 25 27 0 8 -11 20 -25 27 -35 17 -43 46 -19 72 27 29 21 55 -13 59 -40 5 -54 27 -40 64 15 41 9 48 -39 46 -45 -2 -61 13 -57 51 4 36 -25 50 -52 26 -26 -24 -49 -13 -69 33 -18 38 -33 40 -55 7 -10 -15 -26 -25 -40 -25 -14 0 -30 10 -40 25 -23 34 -45 32 -53 -6z m223 -125 c38 -19 71 -45 94 -76 31 -41 60 -108 60 -138 0 -6 -35 -10 -89 -10 -86 0 -89 1 -112 30 -16 19 -39 33 -70 40 -43 11 -48 16 -88 86 -24 41 -41 77 -40 78 17 15 75 25 126 23 44 -2 77 -11 119 -33z m-280 -57 c6 -12 23 -43 39 -70 23 -41 26 -53 18 -85 -5 -22 -5 -55 0 -80 8 -38 6 -48 -17 -82 -14 -22 -26 -43 -26 -47 0 -5 -9 -19 -19 -32 -24 -32 -46 -19 -90 53 -61 101 -52 236 21 327 35 44 58 49 74 16z m178 -173 c21 -20 20 -27 -3 -48 -28 -26 -61 -13 -61 24 0 39 36 53 64 24z m256 -69 c0 -32 -50 -125 -87 -160 -52 -50 -134 -85 -198 -85 -33 0 -93 17 -108 30 -5 4 11 41 36 81 41 67 49 75 83 80 25 4 47 17 63 37 25 30 28 30 119 31 75 1 92 -2 92 -14z" />
      </g>
    </svg>
  )
);

SettingsIcon.displayName = 'SettingsIcon';

export { SettingsIcon };

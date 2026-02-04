/**
 * IconSkills - Custom SVG icon for the Skills power item
 * A layered 3D box representing skill modules
 */
import type { FC } from 'react';

interface IconSkillsProps {
  readonly className?: string;
}

export const IconSkills: FC<IconSkillsProps> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M20.1843 6.04123L13.8442 2.4749C13.5374 2.30231 13.384 2.21602 13.2221 2.18559C13.0788 2.15867 12.9315 2.16339 12.7902 2.19941C12.6306 2.24013 12.483 2.33606 12.1878 2.5279L3.72802 8.02679C3.46201 8.19969 3.32901 8.28614 3.23265 8.40146C3.14735 8.50354 3.08327 8.62161 3.04417 8.74876C3 8.89241 3 9.05104 3 9.3683V16.5642C3 16.9049 3 17.0753 3.04999 17.2274C3.09421 17.3619 3.16652 17.4856 3.26213 17.5901C3.37019 17.7082 3.51865 17.7917 3.81558 17.9588L10.1557 21.5251C10.4626 21.6977 10.616 21.784 10.7779 21.8144C10.9212 21.8413 11.0685 21.8366 11.2098 21.8006C11.3694 21.7599 11.517 21.6639 11.8121 21.4721L20.2719 15.9732C20.5379 15.8003 20.6709 15.7139 20.7673 15.5985C20.8526 15.4965 20.9166 15.3784 20.9557 15.2512C20.9999 15.1076 20.9999 14.949 20.9999 14.6317V7.43575C20.9999 7.09507 20.9999 6.92474 20.9499 6.77263C20.9057 6.63806 20.8334 6.51443 20.7378 6.40991C20.6297 6.29177 20.4813 6.20826 20.1843 6.04123Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M20.5 6.8252L11 13.0003L3.5 8.7815"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M20.9999 11L11 17.5L3 13"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M11 21V13"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

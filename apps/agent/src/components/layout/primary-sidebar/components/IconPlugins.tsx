/**
 * IconPlugins - Custom SVG icon for the Plugins power item
 * A chip/board with vertical pins representing plug-in modules
 */
import type { FC } from 'react';

interface IconPluginsProps {
  readonly className?: string;
}

export const IconPlugins: FC<IconPluginsProps> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M19 14V8C19 7.44772 18.5523 7 18 7H6C5.44772 7 5 7.44771 5 8V14C5 16.2091 6.79086 18 9 18H15C17.2091 18 19 16.2091 19 14Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 18V21"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M15 7V3"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M9 7V3"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

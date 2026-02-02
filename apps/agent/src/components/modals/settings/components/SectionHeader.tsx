import type { SectionHeaderProps } from '../types';
import type { FC } from 'react';

export const SectionHeader: FC<SectionHeaderProps> = ({ title, children }) => (
  <div className="mb-5">
    <h3 className="text-lg font-semibold mb-1.5">{title}</h3>
    {children !== undefined && (
      <p className="text-sm text-muted-foreground/80 leading-relaxed">{children}</p>
    )}
  </div>
);

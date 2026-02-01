import type { SettingItemProps } from '../types';
import type { FC } from 'react';

export const SettingItem: FC<SettingItemProps> = ({ label, description, children }) => (
  <div className="flex items-center justify-between py-3.5">
    <div className="flex-1 pr-4">
      <div className="text-base font-medium">{label}</div>
      {description !== undefined && (
        <div className="text-sm text-muted-foreground/80 mt-1">{description}</div>
      )}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

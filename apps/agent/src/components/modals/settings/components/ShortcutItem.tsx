import type { ShortcutItemProps } from '../types';
import type { FC } from 'react';

import { Kbd, KbdGroup } from '@/components/ui/kbd';

export const ShortcutItem: FC<ShortcutItemProps> = ({ label, keys }) => (
  <div className="flex items-center justify-between py-2.5">
    <span className="text-base text-muted-foreground/70">{label}</span>
    <KbdGroup>
      {keys.map((key, index) => (
        <Kbd key={index}>{key}</Kbd>
      ))}
    </KbdGroup>
  </div>
);

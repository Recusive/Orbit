import { Gift, Newspaper } from 'lucide-react';

import { SidebarItem } from './SidebarItem';

import type { UpdateStatus } from '@/stores/ui/update-store';
import type { FC } from 'react';

interface SidebarUpdateActionsProps {
  readonly status: UpdateStatus;
  readonly dismissed: boolean;
  readonly onDownloadOrRestart: () => void;
  readonly onOpenChangelog: () => void;
}

export const SidebarUpdateActions: FC<SidebarUpdateActionsProps> = ({
  status,
  dismissed,
  onDownloadOrRestart,
  onOpenChangelog,
}) => {
  if ((status !== 'available' && status !== 'ready') || !dismissed) {
    return null;
  }

  return (
    <>
      <SidebarItem
        icon={Gift}
        label={status === 'ready' ? 'Restart to update' : 'Update available'}
        badge={status === 'ready' ? 'Restart' : 'Update'}
        badgeVariant="primary"
        onClick={onDownloadOrRestart}
      />
      <SidebarItem icon={Newspaper} label="What's new" onClick={onOpenChangelog} />
    </>
  );
};

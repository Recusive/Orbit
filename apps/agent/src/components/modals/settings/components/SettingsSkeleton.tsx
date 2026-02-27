/**
 * SettingsSkeleton - Skeleton placeholder while settings pages lazy-load
 *
 * Mimics the universal settings page layout: SectionHeader + SettingItem rows.
 * Purely decorative — no state, no effects, no subscriptions.
 */
import type { FC } from 'react';

/** A single skeleton row matching SettingItem proportions (py-3.5, label + description + control) */
const SkeletonRow: FC = () => (
  <div className="flex items-center justify-between py-3.5">
    <div className="flex-1 pr-4 space-y-2">
      <div className="h-4 w-32 rounded-lg bg-foreground/[0.06]" />
      <div className="h-3 w-56 rounded-lg bg-foreground/[0.04]" />
    </div>
    <div className="h-6 w-10 rounded-full bg-foreground/[0.06] shrink-0" />
  </div>
);

export const SettingsSkeleton: FC = () => (
  <div className="animate-skeleton-in" aria-hidden="true" role="presentation">
    {/* Section header skeleton — matches SectionHeader (mb-5, text-lg title + text-sm description) */}
    <div className="mb-5 space-y-2">
      <div className="h-5 w-36 rounded-lg bg-foreground/[0.06]" />
      <div className="h-3 w-64 rounded-lg bg-foreground/[0.04]" />
    </div>

    {/* Setting rows — matches SettingItem with divide-y */}
    <div className="divide-y divide-border/40">
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
    </div>
  </div>
);

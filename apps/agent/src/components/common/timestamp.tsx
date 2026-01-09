/**
 * Timestamp - Relative and absolute time display
 *
 * NOTE: Time constants come from @/lib/utils/constants.
 * To change update intervals, update TIME_MS in constants.ts.
 */
import { useEffect, useState, useMemo } from 'react';

import type { FC } from 'react';

import { TIME_MS } from '@/lib/utils/constants';

export interface TimestampProps {
  date: Date | string;
  format?: 'relative' | 'absolute' | 'both';
  className?: string;
}

export const Timestamp: FC<TimestampProps> = ({ date, format = 'relative', className = '' }) => {
  const [relativeTime, setRelativeTime] = useState('');

  const dateObj = useMemo(() => (typeof date === 'string' ? new Date(date) : date), [date]);

  const getRelativeTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) return 'just now';
    if (diffMinutes < 60) return `${String(diffMinutes)}m ago`;
    if (diffHours < 24) return `${String(diffHours)}h ago`;
    if (diffDays < 7) return `${String(diffDays)}d ago`;

    return date.toLocaleDateString();
  };

  const getAbsoluteTime = (date: Date): string => {
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  useEffect(() => {
    setRelativeTime(getRelativeTime(dateObj));

    const interval = setInterval(() => {
      setRelativeTime(getRelativeTime(dateObj));
    }, TIME_MS.minute); // Update every minute

    return () => {
      clearInterval(interval);
    };
  }, [dateObj]);

  if (format === 'absolute') {
    return (
      <time className={`text-sm text-muted-foreground ${className}`}>
        {getAbsoluteTime(dateObj)}
      </time>
    );
  }

  if (format === 'both') {
    return (
      <time
        className={`text-sm text-muted-foreground ${className}`}
        title={getAbsoluteTime(dateObj)}
      >
        {relativeTime}
      </time>
    );
  }

  return (
    <time className={`text-sm text-muted-foreground ${className}`} title={getAbsoluteTime(dateObj)}>
      {relativeTime}
    </time>
  );
};

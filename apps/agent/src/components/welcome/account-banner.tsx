/**
 * AccountBanner — Fires a Sonner toast on mount showing credential status.
 *
 * Uses the existing Sonner toast infrastructure (positioned bottom-right in
 * App.tsx) so the notification slides in/out natively without clipping.
 * Clicking the toast opens Account settings.
 */
import { invoke } from '@tauri-apps/api/core';
import { Clock } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { SiClaude } from 'react-icons/si';
import { toast } from 'sonner';

import type { FC } from 'react';

import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui/ui-store';

// ---------------------------------------------------------------------------
// Backend types (mirrors Rust structs in providers.rs)
// ---------------------------------------------------------------------------

interface KeychainStatus {
  hasCredentials: boolean;
  credentialType: string | null;
  expiresAt: number | null;
  entryExists: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimeRemaining(expiresAtMs: number): string {
  const diffMs = expiresAtMs - Date.now();
  if (diffMs <= 0) return 'Expired';

  const totalMinutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `${String(hours)}h ${String(minutes)}m remaining`;
  return `${String(minutes)}m remaining`;
}

function dotBgColor(expiresAtMs: number | null, hasCredentials: boolean): string {
  if (!hasCredentials) return 'bg-muted-foreground/40';
  if (expiresAtMs === null) return 'bg-green-500';
  const diffMs = expiresAtMs - Date.now();
  if (diffMs <= 0) return 'bg-destructive';
  if (diffMs < 5 * 60_000) return 'bg-destructive';
  if (diffMs < 60 * 60_000) return 'bg-yellow-500';
  return 'bg-green-500';
}

function timeTextColor(expiresAtMs: number): string {
  const diffMs = expiresAtMs - Date.now();
  if (diffMs <= 0) return 'text-destructive';
  if (diffMs < 5 * 60_000) return 'text-destructive';
  if (diffMs < 60 * 60_000) return 'text-yellow-500';
  return 'text-green-500';
}

// ---------------------------------------------------------------------------
// Toast content renderer
// ---------------------------------------------------------------------------

/** Returns the toast ID so the caller can schedule manual dismissal. */
function showAccountToast(status: KeychainStatus): string | number {
  const isConnected = status.hasCredentials;

  return toast.custom(
    (id) => (
      <button
        type="button"
        onClick={() => {
          toast.dismiss(id);
          useUIStore.getState().openSettings('account');
        }}
        className={cn(
          'flex items-center gap-4 w-full pl-4 pr-5 py-4 cursor-pointer outline-none',
          'hover:opacity-80 transition-opacity duration-150'
        )}
      >
        {/* Claude icon */}
        <div
          className="flex items-center justify-center h-10 w-10 rounded-xl shrink-0"
          style={{ backgroundColor: isConnected ? '#d9775715' : undefined }}
        >
          <SiClaude
            className={cn('h-5 w-5', isConnected ? undefined : 'text-muted-foreground/60')}
            style={isConnected ? { color: '#d97757' } : undefined}
          />
        </div>

        {/* Info */}
        <div className="flex flex-col gap-1 min-w-0 text-left">
          {/* Row 1: name + status badge */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground/90">Claude Code</span>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none',
                isConnected
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-muted-foreground/10 text-muted-foreground'
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  dotBgColor(status.expiresAt, isConnected)
                )}
              />
              {isConnected ? 'Connected' : 'Not connected'}
            </span>
          </div>

          {/* Row 2: expiry + auth method */}
          <div className="flex items-center gap-2">
            {isConnected && status.expiresAt !== null ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-xs font-medium tabular-nums',
                  timeTextColor(status.expiresAt)
                )}
              >
                <Clock className="h-3.5 w-3.5" />
                {formatTimeRemaining(status.expiresAt)}
              </span>
            ) : null}
            {status.credentialType !== null ? (
              <span className="text-[11px] text-muted-foreground/40 uppercase tracking-wider">
                {status.credentialType}
              </span>
            ) : null}
          </div>
        </div>
      </button>
    ),
    {
      duration: 5000,
      unstyled: true,
      className: '!rounded-xl !border-[3px] !border-border !bg-card !shadow-lg w-full',
    }
  );
}

// ---------------------------------------------------------------------------
// Component (renders nothing — fires toast as side-effect)
// ---------------------------------------------------------------------------

export const AccountBanner: FC = () => {
  const firedRef = useRef(false);

  useEffect(() => {
    // Only fire once per mount
    if (firedRef.current) return;
    firedRef.current = true;

    invoke<KeychainStatus>('check_claude_keychain')
      .then((status) => {
        showAccountToast(status);
      })
      .catch(() => {
        showAccountToast({
          hasCredentials: false,
          credentialType: null,
          expiresAt: null,
          entryExists: false,
          error: 'Failed to check credentials',
        });
      });
  }, []);

  // This component is a side-effect trigger — no DOM output
  return null;
};

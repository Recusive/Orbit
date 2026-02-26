/**
 * AccountBanner — Fires a Sonner toast on mount showing credential status.
 *
 * Styled as an Apple macOS Liquid Glass notification — frosted blur bg
 * with the same tint as the sidebar (via bg-base-layer ::before).
 */
import { invoke } from '@tauri-apps/api/core';
import { Clock, X } from 'lucide-react';
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

declare global {
  interface Window {
    __showAccountToast?: () => void;
  }
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
  if (!hasCredentials) return 'bg-black/20 dark:bg-white/20';
  if (expiresAtMs === null) return 'bg-green-400';
  const diffMs = expiresAtMs - Date.now();
  if (diffMs <= 0) return 'bg-red-400';
  if (diffMs < 5 * 60_000) return 'bg-red-400';
  if (diffMs < 60 * 60_000) return 'bg-yellow-400';
  return 'bg-green-400';
}

function timeTextColor(expiresAtMs: number): string {
  const diffMs = expiresAtMs - Date.now();
  if (diffMs <= 0) return 'text-red-400';
  if (diffMs < 5 * 60_000) return 'text-red-400';
  if (diffMs < 60 * 60_000) return 'text-yellow-400';
  return 'text-green-400';
}

// ---------------------------------------------------------------------------
// Toast content renderer
// ---------------------------------------------------------------------------

const TOAST_DURATION_MS = 6000;

function showAccountToast(status: KeychainStatus): string | number {
  const isConnected = status.hasCredentials;

  return toast.custom(
    (id) => (
      <div
        className="relative w-[344px] rounded-[14px] overflow-hidden cursor-pointer"
        style={{
          backdropFilter: 'blur(40px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.5)',
          border: '0.5px solid rgba(0, 0, 0, 0.08)',
          boxShadow: 'inset 0 0.5px 0 0 rgba(255, 255, 255, 0.06), 0 1px 3px rgba(0, 0, 0, 0.08)',
        }}
        onClick={() => {
          toast.dismiss(id);
          useUIStore.getState().openSettings('account');
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            toast.dismiss(id);
            useUIStore.getState().openSettings('account');
          }
        }}
      >
        {/* Tint layer — lighter in light mode, darker in dark */}
        <div className="absolute inset-0 pointer-events-none bg-black/[0.04] dark:bg-black/[0.15]" />

        {/* Header row — icon, title, dismiss */}
        <div
          className="relative z-10 flex items-center gap-3"
          style={{ padding: '10px 8px 8px 12px' }}
        >
          {/* App icon */}
          <div className="flex items-center justify-center h-8 w-8 rounded-lg shrink-0 bg-black/[0.06] dark:bg-white/10">
            <SiClaude
              className={cn('h-4.5 w-4.5', !isConnected && 'text-black/40 dark:text-white/40')}
              style={isConnected ? { color: '#d97757' } : undefined}
            />
          </div>

          {/* Title */}
          <span
            className="text-[13px] font-bold leading-4 flex-1 truncate text-black/85 dark:text-white/85"
            style={{ letterSpacing: '-0.02em' }}
          >
            Claude Code
          </span>

          {/* Dismiss button */}
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={(e) => {
              e.stopPropagation();
              toast.dismiss(id);
            }}
            className="flex items-center justify-center h-6 w-6 rounded-full shrink-0 bg-black/[0.04] dark:bg-white/[0.06] text-black/50 dark:text-white/50 hover:bg-red-500/20 dark:hover:bg-red-500/20 hover:text-red-400 dark:hover:text-red-400 active:scale-90 transition-[background-color,color,transform] duration-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Status bar — secondary bg strip with connection info */}
        <div
          className="relative z-10 flex items-center gap-2 bg-black/[0.03] dark:bg-white/[0.05]"
          style={{ padding: '7px 12px 9px 12px' }}
        >
          {/* Status dot + Connected */}
          <span
            className="inline-flex items-center gap-1.5 text-[12px] leading-4 text-black/70 dark:text-white/75"
            style={{ letterSpacing: '-0.008em' }}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full shrink-0',
                dotBgColor(status.expiresAt, isConnected)
              )}
            />
            {isConnected ? 'Connected' : 'Not connected'}
          </span>

          {/* Time remaining + credential type (single line) */}
          {isConnected && status.expiresAt !== null ? (
            <>
              <span className="text-black/15 dark:text-white/15">·</span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[11px] font-medium tabular-nums leading-4',
                  timeTextColor(status.expiresAt)
                )}
              >
                <Clock className="h-3 w-3" />
                {formatTimeRemaining(status.expiresAt)}
              </span>
              {status.credentialType !== null ? (
                <>
                  <span className="text-black/15 dark:text-white/15">·</span>
                  <span className="text-[11px] uppercase tracking-wider leading-4 text-black/35 dark:text-white/35">
                    {status.credentialType}
                  </span>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    ),
    {
      duration: TOAST_DURATION_MS,
      unstyled: true,
      className: '!p-0 !bg-transparent !border-0 !shadow-none !opacity-100 w-auto',
    }
  );
}

// Self-managed dismiss: Sonner's toast.custom() can silently ignore duration
// when unstyled is true. This ensures the toast always auto-dismisses.
function showAndAutoDismiss(status: KeychainStatus): void {
  const id = showAccountToast(status);
  setTimeout(() => toast.dismiss(id), TOAST_DURATION_MS);
}

if (import.meta.env.DEV) {
  window.__showAccountToast = (): void => {
    showAndAutoDismiss({
      hasCredentials: true,
      credentialType: 'OAuth',
      expiresAt: Date.now() + 3 * 60 * 60_000,
      entryExists: true,
      error: null,
    });
  };
}

// ---------------------------------------------------------------------------
// Component (renders nothing — fires toast as side-effect)
// ---------------------------------------------------------------------------

export const AccountBanner: FC = () => {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    invoke<KeychainStatus>('check_claude_keychain')
      .then((status) => {
        showAndAutoDismiss(status);
      })
      .catch(() => {
        showAndAutoDismiss({
          hasCredentials: false,
          credentialType: null,
          expiresAt: null,
          entryExists: false,
          error: 'Failed to check credentials',
        });
      });
  }, []);

  return null;
};

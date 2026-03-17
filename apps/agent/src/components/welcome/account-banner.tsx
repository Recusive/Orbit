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
  if (expiresAtMs === null) return 'bg-success';
  const diffMs = expiresAtMs - Date.now();
  if (diffMs <= 0) return 'bg-destructive';
  if (diffMs < 5 * 60_000) return 'bg-destructive';
  if (diffMs < 60 * 60_000) return 'bg-warning';
  return 'bg-success';
}

function timeTextColor(expiresAtMs: number): string {
  const diffMs = expiresAtMs - Date.now();
  if (diffMs <= 0) return 'text-destructive';
  if (diffMs < 5 * 60_000) return 'text-destructive';
  if (diffMs < 60 * 60_000) return 'text-warning';
  return 'text-success';
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
        className="glass-surface w-[344px] overflow-hidden cursor-pointer p-0 gap-0"
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
        {/* Header row — icon, title, dismiss */}
        <div className="flex items-center gap-3 px-3 pt-2.5 pb-2">
          {/* App icon */}
          <div className="flex items-center justify-center h-8 w-8 rounded-lg shrink-0 bg-primary/10">
            <SiClaude
              className={cn('h-4.5 w-4.5', isConnected ? 'text-primary' : 'text-muted-foreground')}
            />
          </div>

          {/* Title */}
          <span className="liquid-glass-title flex-1 truncate">Claude Code</span>

          {/* Dismiss button */}
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={(e) => {
              e.stopPropagation();
              toast.dismiss(id);
            }}
            className="flex items-center justify-center h-6 w-6 rounded-full shrink-0 bg-lg-control text-muted-foreground hover:bg-destructive/20 hover:text-destructive active:scale-90 transition-[background-color,color,transform] duration-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border/50">
          {/* Status dot + Connected */}
          <span className="inline-flex items-center gap-1.5 text-[12px] leading-4 text-muted-foreground tracking-tight">
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
              <span className="text-border">·</span>
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
                  <span className="text-border">·</span>
                  <span className="text-[11px] uppercase tracking-wider leading-4 text-muted-foreground/50">
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
      className: '!p-0 !bg-transparent !border-0 !shadow-none w-auto',
    }
  );
}

function showAndAutoDismiss(status: KeychainStatus): void {
  showAccountToast(status);
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

interface AccountBannerProps {
  /**
   * When true, defers firing the toast until deferToast transitions to false.
   * When undefined or false on mount, fires immediately (existing behavior preserved).
   */
  readonly deferToast?: boolean | undefined;
}

export const AccountBanner: FC<AccountBannerProps> = ({ deferToast }) => {
  const firedRef = useRef(false);

  useEffect(() => {
    // If deferred, wait until deferToast becomes false
    if (deferToast === true) return;
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
  }, [deferToast]);

  return null;
};

/**
 * UpdateToast — Rich card-style toast for the auto-update lifecycle.
 *
 * Uses the app's Liquid Glass design system (glass-surface, liquid-glass-*)
 * to match the dialog UI language. Renders inside Sonner's toast.custom() portal.
 */

import { AlertTriangle, Check, Gift } from 'lucide-react';
import { toast } from 'sonner';

import type { FC, ReactNode } from 'react';

import { useUIStore } from '@/stores/ui/ui-store';

// ── Constants ─────────────────────────────────────────────────────────

const UPDATE_TOAST_ID = 'orbit-update';

/** Sonner wrapper — transparent so the card handles all styling. */
const TOAST_WRAPPER_CLASS = '!p-0 !bg-transparent !border-0 !shadow-none w-full';

// ── Inner card component ──────────────────────────────────────────────

interface UpdateCardProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly overlayText: ReactNode;
  readonly progress?: number;
  readonly footer?: ReactNode;
}

const UpdateCard: FC<UpdateCardProps> = ({
  icon,
  title,
  description,
  overlayText,
  progress,
  footer,
}) => (
  <div className="glass-surface w-full max-w-[24rem] overflow-hidden p-0 gap-0">
    {/* Hero area */}
    <div
      className="relative mx-1.5 mt-1.5 overflow-hidden bg-sidebar dark:bg-chat-area"
      style={{ aspectRatio: '16 / 9', borderRadius: '9px' }}
    >
      <div
        className="absolute inset-0 z-10 flex items-center justify-center text-center text-primary pointer-events-none"
        style={{ fontFamily: "'Instrument Serif', serif", fontSize: '1.5rem' }}
      >
        {overlayText}
      </div>
    </div>

    {/* Content */}
    <div className="flex flex-col gap-2.5 px-4 pt-4 pb-1">
      {/* Icon + Title */}
      <div className="flex w-full items-center gap-3">
        <div className="liquid-glass-icon flex shrink-0 items-center justify-center bg-primary/10 !w-8 !h-8 !rounded-lg">
          <span className="text-primary">{icon}</span>
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="liquid-glass-title">{title}</div>
          <div className="liquid-glass-desc">{description}</div>
        </div>
      </div>

      {/* Progress bar */}
      {progress !== undefined ? (
        <div className="flex items-center gap-2 mt-0.5">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-lg-separator">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${String(progress)}%` }}
            />
          </div>
          <span className="text-[11px] font-medium tabular-nums text-muted-foreground min-w-[2rem] text-right">
            {String(progress)}%
          </span>
        </div>
      ) : null}
    </div>

    {/* Footer buttons */}
    {footer !== null && footer !== undefined ? (
      <div className="flex w-full items-center gap-2 px-4 pt-2.5 pb-4">{footer}</div>
    ) : null}
  </div>
);

// ── Button primitives ─────────────────────────────────────────────────

interface ToastButtonProps {
  readonly label: string;
  readonly onClick: () => void;
  readonly variant?: 'primary' | 'secondary';
}

const ToastButton: FC<ToastButtonProps> = ({ label, onClick, variant = 'primary' }) => (
  <button
    type="button"
    onClick={onClick}
    className={`liquid-glass-btn flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97] ${variant === 'primary' ? 'liquid-glass-btn-primary' : 'liquid-glass-btn-secondary'}`}
  >
    {label}
  </button>
);

// ── Public API ────────────────────────────────────────────────────────

/** Show "Update available" card with Update now / Later buttons. */
export function showUpdateAvailable(
  version: string,
  onUpdate: () => void,
  onDismiss?: () => void
): void {
  toast.custom(
    () => (
      <UpdateCard
        icon={<Gift className="h-3.5 w-3.5" />}
        title={`Orbit v${version} available`}
        description="A new version is ready to download."
        overlayText={
          <>
            New Update{' '}
            <span className="font-mono text-sm px-1.5 py-1 rounded bg-primary/12 ml-2 align-middle">
              v{version}
            </span>
          </>
        }
        footer={
          <>
            <ToastButton
              label="Later"
              variant="secondary"
              onClick={() => {
                toast.dismiss(UPDATE_TOAST_ID);
                onDismiss?.();
              }}
            />
            <ToastButton
              label="Changelog"
              variant="secondary"
              onClick={() => {
                useUIStore.getState().openSettings('changelog');
              }}
            />
            <ToastButton label="Update now" onClick={onUpdate} />
          </>
        }
      />
    ),
    {
      id: UPDATE_TOAST_ID,
      duration: Infinity,
      unstyled: true,
      className: TOAST_WRAPPER_CLASS,
    }
  );
}

/** Show downloading card with animated progress bar. */
export function showUpdateDownloading(progress: number): void {
  toast.custom(
    () => (
      <UpdateCard
        icon={<Gift className="h-3.5 w-3.5 animate-pulse" />}
        title={`Downloading update... ${String(progress)}%`}
        description="Please wait while the update is downloaded."
        overlayText={`Downloading · ${String(progress)}%`}
        progress={progress}
      />
    ),
    {
      id: UPDATE_TOAST_ID,
      duration: Infinity,
      unstyled: true,
      className: TOAST_WRAPPER_CLASS,
    }
  );
}

/** Show "Update ready" card with Restart now button. */
export function showUpdateReady(onRestart: () => void, onDismiss?: () => void): void {
  toast.custom(
    () => (
      <UpdateCard
        icon={<Check className="h-3.5 w-3.5" />}
        title="Update installed"
        description="Restart Orbit to apply the update."
        overlayText="Update Installed"
        footer={
          <>
            <ToastButton
              label="Later"
              variant="secondary"
              onClick={() => {
                toast.dismiss(UPDATE_TOAST_ID);
                onDismiss?.();
              }}
            />
            <ToastButton label="Restart now" onClick={onRestart} />
          </>
        }
      />
    ),
    {
      id: UPDATE_TOAST_ID,
      duration: Infinity,
      unstyled: true,
      className: TOAST_WRAPPER_CLASS,
    }
  );
}

/** Show error card with Retry button. */
export function showUpdateError(message: string, onRetry: () => void): void {
  toast.custom(
    () => (
      <UpdateCard
        icon={<AlertTriangle className="h-3.5 w-3.5" />}
        title="Update failed"
        description={message}
        overlayText="Update Failed"
        footer={
          <>
            <ToastButton
              label="Dismiss"
              variant="secondary"
              onClick={() => {
                toast.dismiss(UPDATE_TOAST_ID);
              }}
            />
            <ToastButton
              label="Retry"
              onClick={() => {
                toast.dismiss(UPDATE_TOAST_ID);
                onRetry();
              }}
            />
          </>
        }
      />
    ),
    {
      id: UPDATE_TOAST_ID,
      duration: Infinity,
      unstyled: true,
      className: TOAST_WRAPPER_CLASS,
    }
  );
}

/** Dismiss the update toast. */
export function dismissUpdateToast(): void {
  toast.dismiss(UPDATE_TOAST_ID);
}

/**
 * UpdateToast — Rich card-style toast for the auto-update lifecycle.
 *
 * Uses plain CSS (scoped with `ot-` prefix) to guarantee pixel-perfect
 * rendering inside Sonner's `toast.custom()` portal.
 */

import { AlertTriangle, Check, Gift } from 'lucide-react';
import { toast } from 'sonner';

import type { FC, ReactNode } from 'react';

import welcomeBg from '@/assets/welcome-bg.png';

// ── Constants ─────────────────────────────────────────────────────────

const UPDATE_TOAST_ID = 'orbit-update';

/** Sonner wrapper — transparent so .ot-card handles all styling. */
const TOAST_WRAPPER_CLASS = '!p-0 !bg-transparent !border-0 !shadow-none w-full';

/** Scoped CSS for the update toast card. */
const TOAST_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap');

.ot-card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 24rem;
  border-radius: 9px;
  border: 1px solid var(--border-menu);
  background: var(--glass-popover-bg);
  box-shadow: 0 0 20px -4px rgba(0, 0, 0, 0.15), 0 0 8px -2px rgba(0, 0, 0, 0.1);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
  overflow: hidden;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

html.dark .ot-card {
  box-shadow: 0 0 20px -4px rgba(0, 0, 0, 0.4), 0 0 8px -2px rgba(0, 0, 0, 0.3);
  -webkit-backdrop-filter: blur(24px);
  backdrop-filter: blur(24px);
}

.ot-image-wrapper {
  position: relative;
  margin: 6px 6px 0 6px;
  width: calc(100% - 12px);
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 6px;
  background: var(--lg-control);
}

.ot-overlay-text {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Instrument Serif', serif;
  font-size: 1.5rem;
  color: #1d1816;
  text-align: center;
  pointer-events: none;
}

.ot-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  -webkit-user-drag: none;
  user-select: none;
  pointer-events: none;
}

.ot-content {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 1.25rem 1rem 0.75rem;
}

.ot-title-row {
  display: flex;
  align-items: center;
  gap: 0.125rem;
}

.ot-title-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 1.5rem;
  width: 1.5rem;
  border-radius: 0.375rem;
  background: var(--lg-control);
  color: var(--primary);
  flex-shrink: 0;
}

.ot-title-icon svg {
  width: 0.875rem;
  height: 0.875rem;
}

.ot-title {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.4;
  color: var(--foreground);
  letter-spacing: -0.01em;
}

.ot-description {
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--muted-foreground);
}

.ot-progress-wrapper {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.125rem;
}

.ot-progress-track {
  flex: 1;
  height: 0.375rem;
  background: var(--lg-separator);
  border-radius: 9999px;
  overflow: hidden;
}

.ot-progress-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 9999px;
  transition: width 0.3s ease;
}

.ot-progress-label {
  font-size: 0.6875rem;
  font-weight: 510;
  font-variant-numeric: tabular-nums;
  color: var(--muted-foreground);
  min-width: 2rem;
  text-align: right;
}

.ot-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.5rem 1rem 1.25rem;
}

.ot-btn {
  padding: 0.375rem 0.75rem;
  border-radius: 100px;
  border: none;
  font-family: inherit;
  font-size: var(--lg-font-size);
  font-weight: 510;
  cursor: pointer;
  transition: opacity 0.15s ease;
  outline: none;
}

.ot-btn-primary {
  background: var(--primary);
  color: var(--primary-foreground);
}

.ot-btn-primary:hover { opacity: 0.85; }

.ot-btn-ghost {
  background: var(--lg-alert-secondary-bg);
  color: var(--lg-alert-secondary-text);
}

.ot-btn-ghost:hover {
  background: var(--lg-alert-secondary-bg-hover);
  opacity: 1;
}
`;

// ── Inner card component ──────────────────────────────────────────────

interface UpdateCardProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly overlayText: string;
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
  <>
    <style>{TOAST_STYLES}</style>
    <div className="ot-card">
      <div className="ot-image-wrapper">
        <img className="ot-image" src={welcomeBg} alt="Update background" draggable={false} />
        <div className="ot-overlay-text">{overlayText}</div>
      </div>
      <div className="ot-content">
        <div className="ot-title-row">
          <div className="ot-title-icon">{icon}</div>
          <div className="ot-title">{title}</div>
        </div>
        <div className="ot-description">{description}</div>
        {progress !== undefined ? (
          <div className="ot-progress-wrapper">
            <div className="ot-progress-track">
              <div className="ot-progress-fill" style={{ width: `${String(progress)}%` }} />
            </div>
            <span className="ot-progress-label">{String(progress)}%</span>
          </div>
        ) : null}
      </div>
      {footer !== null && footer !== undefined ? <div className="ot-footer">{footer}</div> : null}
    </div>
  </>
);

// ── Button primitives ─────────────────────────────────────────────────

interface ToastButtonProps {
  readonly label: string;
  readonly onClick: () => void;
  readonly variant?: 'primary' | 'ghost';
}

const ToastButton: FC<ToastButtonProps> = ({ label, onClick, variant = 'primary' }) => (
  <button
    type="button"
    onClick={onClick}
    className={`ot-btn ${variant === 'primary' ? 'ot-btn-primary' : 'ot-btn-ghost'}`}
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
        overlayText={`New Update · v${version}`}
        footer={
          <>
            <ToastButton
              label="Later"
              variant="ghost"
              onClick={() => {
                toast.dismiss(UPDATE_TOAST_ID);
                onDismiss?.();
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
              variant="ghost"
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
              variant="ghost"
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

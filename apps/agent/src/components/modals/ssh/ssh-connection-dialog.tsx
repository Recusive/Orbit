import { createLogger } from '@orbit/common/lib';
import { AlertCircle, Loader2, Terminal, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { FC, KeyboardEvent } from 'react';

import {
  Dialog,
  DialogClose,
  DialogContentGlass,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  addSshHost,
  conversationList,
  getSshHosts,
  initializeWorkspace,
  openFileDialog,
  removeSshHost,
} from '@/lib/api';
import { toConversationSummaries } from '@/lib/mappers';
import { useFileStore } from '@/stores/file/file-store';
import { useTerminalStore } from '@/stores/terminal/terminal-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('SSHConnectionDialog');

export interface SSHConnectionDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * Validate an SSH host string.
 * Accepts formats like:
 * - user@hostname
 * - user@hostname:port
 * - hostname (no user)
 * - hostname:port
 */
function isValidSshHost(host: string): boolean {
  const trimmed = host.trim();
  if (!trimmed) return false;

  // Basic pattern: optional user@, required hostname, optional :port
  // Hostname can be domain name or IP address
  const pattern = /^([a-zA-Z0-9_-]+@)?[a-zA-Z0-9.-]+(:\d+)?$/;
  return pattern.test(trimmed);
}

/**
 * Parse SSH host to extract display name.
 * Returns the hostname portion for display.
 */
function getHostDisplayName(host: string): string {
  // Remove port if present
  const withoutPort = host.replace(/:\d+$/, '');
  // Get hostname (after @ if present)
  const parts = withoutPort.split('@');
  const hostname = parts.length > 1 ? parts[1] : parts[0];
  return hostname ?? host;
}

/**
 * Dialog for connecting to an SSH host.
 * Opens a terminal session with the SSH command.
 */
export const SSHConnectionDialog: FC<SSHConnectionDialogProps> = ({ open, onOpenChange }) => {
  const createSession = useTerminalStore((s) => s.createSession);
  const setActiveSession = useTerminalStore((s) => s.setActiveSession);
  const setRootPath = useFileStore((s) => s.setRootPath);

  // Form state
  const [sshHost, setSshHost] = useState('');
  const [recentHosts, setRecentHosts] = useState<string[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load recent hosts when dialog opens
  useEffect(() => {
    if (open) {
      setSshHost('');
      setError(null);
      void loadRecentHosts();
    }
  }, [open]);

  const loadRecentHosts = async (): Promise<void> => {
    try {
      const hosts = await getSshHosts();
      setRecentHosts(hosts);
    } catch (err) {
      logger.error('Failed to load recent SSH hosts', err);
    }
  };

  const handleRemoveHost = useCallback(async (host: string): Promise<void> => {
    try {
      await removeSshHost(host);
      setRecentHosts((prev) => prev.filter((h) => h !== host));
    } catch (err) {
      logger.error('Failed to remove SSH host', err);
    }
  }, []);

  const handleConnect = useCallback(async (): Promise<void> => {
    const host = sshHost.trim();
    if (!host) return;

    // Validate host
    if (!isValidSshHost(host)) {
      setError('Please enter a valid SSH host (e.g., user@hostname or hostname:port)');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Check if we have a workspace set (needed to show the terminal panel)
      // The Welcome Page doesn't have a terminal panel - we need to transition to the main layout
      // IMPORTANT: Check frontend state (rootPath), not backend (getWorkspacePath)
      // The backend may have a persisted workspace from a previous session,
      // but the frontend might still be showing the Welcome Page
      const frontendRootPath = useFileStore.getState().rootPath;

      if (!frontendRootPath) {
        // No workspace - prompt user to select a folder first
        // This transitions the app from Welcome Page to main editor view
        const selected = await openFileDialog({
          title: 'Select a workspace folder',
          directory: true,
          multiple: false,
        });

        if (selected === null || typeof selected !== 'string') {
          // User cancelled folder selection
          setError('Please select a workspace folder to open the terminal panel');
          setIsConnecting(false);
          return;
        }

        // Set the workspace and build file index for fuzzy search
        await initializeWorkspace(selected);
        useUIStore.getState().initializeWorkspace(selected);
        setRootPath(selected);

        // Load conversations for this workspace (Claude Code-style folder isolation)
        const conversations = await conversationList(selected);
        useUIStore.getState().setConversations(toConversationSummaries(conversations));

        logger.info('Set workspace for SSH terminal', { workspace: selected });
      }

      // Save to recent hosts
      await addSshHost(host);

      // Create a new terminal session with the SSH command as initial command
      // The PTY creation is handled by TerminalInstance when the terminal panel renders
      // The initial command will be executed automatically after the terminal connects
      const hostDisplay = getHostDisplayName(host);
      const sshCommand = `ssh ${host}`;
      const sessionId = createSession(`SSH: ${hostDisplay}`, undefined, sshCommand);

      // Make it the active session
      setActiveSession(sessionId);

      logger.info('SSH session created', { host, sessionId, sshCommand });

      // Open the terminal panel if not already visible
      useUIStore.setState({ bottomPanelOpen: true, bottomPanelTab: 'terminal' });

      // Close the dialog
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      logger.error('Failed to initiate SSH connection', err);
      setError(message);
    } finally {
      setIsConnecting(false);
    }
  }, [sshHost, createSession, setActiveSession, setRootPath, onOpenChange]);

  const handleSelectRecentHost = useCallback((host: string): void => {
    setSshHost(host);
    setError(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter' && sshHost.trim() && !isConnecting) {
        e.preventDefault();
        void handleConnect();
      }
    },
    [sshHost, isConnecting, handleConnect]
  );

  // Prevent closing dialog while connecting
  const handleOpenChange = useCallback(
    (newOpen: boolean): void => {
      if (!newOpen && isConnecting) {
        return;
      }
      onOpenChange(newOpen);
    },
    [isConnecting, onOpenChange]
  );

  const isValid = sshHost.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContentGlass className="w-[360px] gap-0 overflow-hidden p-0 glass-surface [&>.absolute]:hidden">
        <DialogClose className="absolute right-3 top-3 z-10 rounded-[9px] p-1 bg-foreground/8 text-muted-foreground/50 transition-all duration-150 hover:bg-destructive-subtle hover:text-destructive-text">
          <X className="h-3.5 w-3.5" />
          <span className="sr-only">Close</span>
        </DialogClose>

        <div className="relative flex flex-col items-center gap-4 px-4 pb-4 pt-5">
          {/* Icon */}
          <div className="flex w-full items-center px-1.5">
            <div className="liquid-glass-icon flex shrink-0 items-center justify-center bg-primary/10">
              <Terminal className="h-7 w-7 text-primary" aria-hidden="true" />
            </div>
          </div>

          {/* Title + Description */}
          <div className="flex w-full flex-col items-start gap-2.5 px-1.5 pb-0.5">
            <DialogTitle className="liquid-glass-title w-full">Connect to SSH host</DialogTitle>
            <DialogDescription className="liquid-glass-desc w-full">
              Enter an SSH host to open a terminal connection.
            </DialogDescription>
          </div>

          {/* SSH Host input */}
          <div className="w-full px-1.5">
            <div className="relative">
              <Terminal
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50"
                aria-hidden="true"
              />
              <input
                id="ssh-host"
                autoFocus
                value={sshHost}
                onChange={(e) => {
                  setSshHost(e.target.value);
                  setError(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder="user@hostname or hostname:port"
                className="liquid-glass-textarea liquid-glass-textarea-icon h-9 w-full rounded-[9px] text-sm outline-none"
                aria-label="SSH host"
                disabled={isConnecting}
              />
            </div>
            {error !== null ? (
              <div className="mt-1.5 flex items-start gap-1.5">
                <AlertCircle
                  className="h-3.5 w-3.5 shrink-0 mt-0.5 text-destructive"
                  aria-hidden="true"
                />
                <p className="text-[12px] text-destructive">{error}</p>
              </div>
            ) : null}
          </div>

          {/* Recent hosts list */}
          {recentHosts.length > 0 ? (
            <div className="w-full px-1.5">
              <p className="text-[12px] text-muted-foreground font-medium mb-1.5">Recent Hosts</p>
              <div className="flex flex-col gap-0.5 max-h-[120px] overflow-y-auto">
                {recentHosts.map((host) => (
                  <div
                    key={host}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-[7px] hover:bg-lg-control-hover cursor-pointer group"
                    onClick={() => {
                      handleSelectRecentHost(host);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        handleSelectRecentHost(host);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                  >
                    <Terminal
                      className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                      aria-hidden="true"
                    />
                    <span className="flex-1 text-sm truncate">{host}</span>
                    <button
                      type="button"
                      className="h-5 w-5 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity duration-150"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRemoveHost(host);
                      }}
                    >
                      <X className="h-3 w-3" />
                      <span className="sr-only">Remove</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Buttons */}
          <div className="flex w-full items-center gap-2">
            <button
              type="button"
              className="liquid-glass-btn liquid-glass-btn-secondary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97]"
              onClick={() => {
                onOpenChange(false);
              }}
              disabled={isConnecting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="liquid-glass-btn liquid-glass-btn-primary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97] flex items-center justify-center gap-2"
              onClick={() => {
                void handleConnect();
              }}
              disabled={!isValid || isConnecting}
            >
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Connecting...
                </>
              ) : (
                'Connect'
              )}
            </button>
          </div>
        </div>
      </DialogContentGlass>
    </Dialog>
  );
};

import { createLogger } from '@orbit/common/lib';
import { AlertCircle, Loader2, Terminal, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { FC, KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
        useUIStore.getState().setWorkspace(selected);
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
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Connect to SSH Host</DialogTitle>
          <DialogDescription>Enter an SSH host to open a terminal connection.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* SSH Host input */}
          <div className="grid gap-2">
            <label htmlFor="ssh-host" className="text-sm font-medium">
              SSH Host
            </label>
            <div className="relative">
              <Terminal className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="ssh-host"
                placeholder="user@hostname or hostname:port"
                value={sshHost}
                onChange={(e) => {
                  setSshHost(e.target.value);
                  setError(null);
                }}
                onKeyDown={handleKeyDown}
                className="pl-9"
                autoFocus
              />
            </div>
          </div>

          {/* Recent hosts list */}
          {recentHosts.length > 0 && (
            <div className="grid gap-2">
              <label className="text-sm font-medium text-muted-foreground">Recent Hosts</label>
              <div className="flex flex-col gap-1 max-h-[150px] overflow-y-auto">
                {recentHosts.map((host) => (
                  <div
                    key={host}
                    className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-lg-control-hover cursor-pointer group"
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
                    <Terminal className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-sm truncate">{host}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRemoveHost(host);
                      }}
                    >
                      <X className="h-3 w-3" />
                      <span className="sr-only">Remove</span>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error message */}
          {error !== null && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={isConnecting}
          >
            Cancel
          </Button>
          <Button onClick={() => void handleConnect()} disabled={!isValid || isConnecting}>
            {isConnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              'Connect'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

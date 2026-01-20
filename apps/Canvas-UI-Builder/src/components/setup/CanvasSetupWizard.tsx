/**
 * Canvas Setup Wizard
 *
 * Shown on first Canvas launch to initialize the ~/.orbit/canvas directory,
 * download shadcn components, and scaffold the preview server.
 *
 * The setup flow:
 * 1. Initialize directories (~/.orbit/canvas/components/ui, etc.)
 * 2. Download all shadcn/ui components from registry
 * 3. Scaffold the Vite preview server
 * 4. Install preview server dependencies (bun install)
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Check, Download, FolderOpen, Layers, Package, Sparkles } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

import type { UnlistenFn } from '@tauri-apps/api/event';
import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Props for the setup wizard */
interface CanvasSetupWizardProps {
  /** Path to ~/.orbit/canvas */
  orbitPath: string;
  /** Callback when setup completes successfully */
  onComplete: () => void;
}

/** Progress event from Rust download commands */
interface DownloadProgress {
  component: string;
  current: number;
  total: number;
  phase: 'downloading' | 'complete' | 'error';
}

/** Download summary from batch download */
interface DownloadSummary {
  total: number;
  successful: number;
  failed: number;
  npm_dependencies: string[];
  errors: string[];
}

/** Current phase of the setup process */
type SetupPhase =
  | 'welcome'
  | 'initializing'
  | 'downloading'
  | 'scaffolding'
  | 'installing'
  | 'complete'
  | 'error';

/**
 * Canvas Setup Wizard Component
 *
 * Guides users through the initial Canvas environment setup.
 */
export const CanvasSetupWizard: FC<CanvasSetupWizardProps> = ({ orbitPath, onComplete }) => {
  const [phase, setPhase] = useState<SetupPhase>('welcome');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadSummary, setDownloadSummary] = useState<DownloadSummary | null>(null);

  // Listen for download progress events
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    const setupListener = async (): Promise<void> => {
      unlisten = await listen<DownloadProgress>('canvas:download-progress', (event) => {
        setProgress(event.payload);
      });
    };

    void setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const runSetup = useCallback(async (): Promise<void> => {
    setPhase('initializing');
    setError(null);

    try {
      // Step 1: Initialize directories
      await invoke('canvas_initialize_directories');

      // Step 2: Download all components
      setPhase('downloading');
      const summary = await invoke<DownloadSummary>('canvas_download_all_components');
      setDownloadSummary(summary);

      if (summary.failed > 0 && summary.successful === 0) {
        throw new Error(`All downloads failed: ${summary.errors.join(', ')}`);
      }

      // Step 3: Scaffold preview server
      setPhase('scaffolding');
      await invoke('canvas_setup_preview_server');

      // Step 4: Install dependencies
      setPhase('installing');
      await invoke('canvas_install_preview_deps');

      // Complete!
      setPhase('complete');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      setPhase('error');
    }
  }, []);

  const handleRetry = useCallback((): void => {
    setPhase('welcome');
    setError(null);
    setProgress(null);
    setDownloadSummary(null);
  }, []);

  // Calculate progress percentage
  const progressPercent = progress ? (progress.current / progress.total) * 100 : 0;

  // Phase titles and descriptions
  const getPhaseTitle = (): string => {
    switch (phase) {
      case 'welcome':
        return 'Welcome to Canvas UI Builder';
      case 'initializing':
        return 'Initializing...';
      case 'downloading':
        return 'Downloading Components';
      case 'scaffolding':
        return 'Setting Up Preview';
      case 'installing':
        return 'Installing Dependencies';
      case 'complete':
        return 'Setup Complete!';
      case 'error':
        return 'Setup Failed';
    }
  };

  const getPhaseDescription = (): string => {
    switch (phase) {
      case 'welcome':
        return 'Canvas needs to download the shadcn component library to get started.';
      case 'initializing':
        return 'Creating directory structure...';
      case 'downloading':
        return progress?.component ?? 'Starting download...';
      case 'scaffolding':
        return 'Configuring the preview environment...';
      case 'installing':
        return 'Running bun install... (this may take a minute)';
      case 'complete':
        return `${String(downloadSummary?.successful ?? 50)}+ components ready to use.`;
      case 'error':
        return 'Something went wrong during setup.';
    }
  };

  // Setup steps for progress indicator
  const steps = [
    { id: 'initializing', label: 'Initialize', icon: FolderOpen },
    { id: 'downloading', label: 'Download', icon: Download },
    { id: 'scaffolding', label: 'Configure', icon: Layers },
    { id: 'installing', label: 'Install', icon: Package },
  ];

  const getStepStatus = (stepId: string): 'pending' | 'active' | 'complete' => {
    const stepOrder = ['initializing', 'downloading', 'scaffolding', 'installing'];
    const currentIndex = stepOrder.indexOf(phase);
    const stepIndex = stepOrder.indexOf(stepId);

    if (phase === 'complete' || phase === 'error') return 'complete';
    if (currentIndex === -1) return 'pending';
    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  const isInProgress =
    phase === 'initializing' ||
    phase === 'downloading' ||
    phase === 'scaffolding' ||
    phase === 'installing';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md mx-4 overflow-hidden rounded-xl border border-border/50 bg-background shadow-2xl">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-border/50">
          {/* Icon */}
          <div className="mb-3 inline-flex rounded-lg bg-primary/10 p-2.5">
            {phase === 'complete' ? (
              <Check className="h-5 w-5 text-primary" />
            ) : phase === 'error' ? (
              <Sparkles className="h-5 w-5 text-destructive" />
            ) : (
              <Sparkles className="h-5 w-5 text-primary" />
            )}
          </div>

          <h2 className="text-lg font-semibold text-foreground">{getPhaseTitle()}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{getPhaseDescription()}</p>
        </div>

        {/* Content */}
        <div className="p-6 pt-4 space-y-5">
          {/* Welcome screen */}
          {phase === 'welcome' && (
            <>
              {/* Destination path */}
              <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3 border border-border/50">
                <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                <code className="text-sm text-muted-foreground break-all">{orbitPath}</code>
              </div>

              {/* What will happen */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">This will:</p>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-primary" />
                    Download ~50 shadcn/ui components
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-primary" />
                    Set up a local preview environment
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-primary" />
                    Install required dependencies
                  </li>
                </ul>
              </div>

              <Button onClick={() => void runSetup()} className="w-full h-10">
                <Download className="h-4 w-4 mr-2" />
                Start Setup
              </Button>
            </>
          )}

          {/* Progress states */}
          {isInProgress ? (
            <>
              {/* Step indicators */}
              <div className="flex items-center justify-between px-2">
                {steps.map((step, index) => {
                  const status = getStepStatus(step.id);
                  const Icon = step.icon;
                  return (
                    <div key={step.id} className="flex items-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <div
                          className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors',
                            status === 'complete' &&
                              'border-primary bg-primary text-primary-foreground',
                            status === 'active' && 'border-primary bg-primary/10 text-primary',
                            status === 'pending' && 'border-border bg-muted text-muted-foreground'
                          )}
                        >
                          {status === 'complete' ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Icon className="h-4 w-4" />
                          )}
                        </div>
                        <span
                          className={cn(
                            'text-xs font-medium',
                            status === 'active' ? 'text-foreground' : 'text-muted-foreground'
                          )}
                        >
                          {step.label}
                        </span>
                      </div>
                      {index < steps.length - 1 && (
                        <div
                          className={cn(
                            'mx-2 mt-[-1.25rem] h-0.5 w-6 rounded-full',
                            getStepStatus(steps[index + 1]?.id ?? '') !== 'pending'
                              ? 'bg-primary'
                              : 'bg-border'
                          )}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Progress bar for downloading phase */}
              {phase === 'downloading' && (
                <div className="space-y-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all duration-300 ease-out"
                      style={{ width: `${String(progressPercent)}%` }}
                    />
                  </div>
                  {progress ? (
                    <p className="text-xs text-muted-foreground text-center">
                      {progress.current} of {progress.total} components
                    </p>
                  ) : null}
                </div>
              )}

              {/* Indeterminate progress for other phases */}
              {phase !== 'downloading' && (
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full w-1/3 bg-primary rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]"
                    style={{
                      animation: 'shimmer 1.5s ease-in-out infinite',
                    }}
                  />
                </div>
              )}

              {phase === 'installing' && (
                <p className="text-xs text-muted-foreground text-center">
                  Installing dependencies... this may take a minute
                </p>
              )}
            </>
          ) : null}

          {/* Complete */}
          {phase === 'complete' && (
            <>
              {/* Success checkmarks */}
              <div className="flex items-center justify-center gap-3 py-2">
                {steps.map((step) => {
                  const Icon = step.icon;
                  return (
                    <div
                      key={step.id}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10"
                    >
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                  );
                })}
              </div>

              {downloadSummary && downloadSummary.failed > 0 ? (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    Note: {downloadSummary.failed} component(s) failed to download but you can
                    continue.
                  </p>
                </div>
              ) : null}

              <Button onClick={onComplete} className="w-full h-10">
                <Sparkles className="h-4 w-4 mr-2" />
                Get Started
              </Button>
            </>
          )}

          {/* Error */}
          {phase === 'error' && (
            <>
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
                <p className="text-sm text-destructive font-mono break-all leading-relaxed">
                  {error}
                </p>
              </div>
              <Button variant="outline" onClick={handleRetry} className="w-full h-10">
                Try Again
              </Button>
            </>
          )}
        </div>
      </div>

      {/* CSS for shimmer animation */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
};

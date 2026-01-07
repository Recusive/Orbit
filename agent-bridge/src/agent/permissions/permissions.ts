/**
 * Permission system for Orbit.
 */

import { localize } from '../../common/i18n/nls.js';
import { createLogger } from '../../common/logging/logger.js';

import type { PermissionResult, PermissionUpdate } from '@anthropic-ai/claude-agent-sdk';

const logger = createLogger('PermissionManager');

/**
 * Callback type for permission requests
 */
export type PermissionRequestCallback = (
  toolName: string,
  toolInput: Record<string, unknown>,
  context: {
    signal: AbortSignal;
    suggestions?: unknown[];
  }
) => Promise<{
  decision: 'approve' | 'deny';
  always: boolean;
  /** For AskUserQuestion tool - user's answers to the questions */
  answers?: Record<string, string>;
}>;

/**
 * Callback type for file snapshots (checkpointing)
 */
export type SnapshotCallback = (
  toolName: string,
  toolInput: Record<string, unknown>,
  toolUseId: string | null
) => Promise<void>;

/**
 * Manages permission requests for tool usage.
 */
export class PermissionManager {
  private requestCallback?: PermissionRequestCallback;
  private snapshotCallback?: SnapshotCallback;
  private alwaysAllowedTools = new Set<string>();
  private acceptModeGetter?: () => boolean;

  constructor(
    requestCallback?: PermissionRequestCallback,
    snapshotCallback?: SnapshotCallback,
    acceptModeGetter?: () => boolean
  ) {
    if (requestCallback !== undefined) {
      this.requestCallback = requestCallback;
    }
    if (snapshotCallback !== undefined) {
      this.snapshotCallback = snapshotCallback;
    }
    if (acceptModeGetter !== undefined) {
      this.acceptModeGetter = acceptModeGetter;
    }
  }

  /**
   * Reset the always-allowed tools set.
   */
  resetAlwaysAllowed(): void {
    this.alwaysAllowedTools.clear();
  }

  /**
   * Add a tool to the always-allowed list.
   */
  addAlwaysAllowed(toolName: string): void {
    this.alwaysAllowedTools.add(toolName);
  }

  /**
   * Check if a tool is always allowed.
   */
  isAlwaysAllowed(toolName: string): boolean {
    return this.alwaysAllowedTools.has(toolName);
  }

  /**
   * Create permission callback for the SDK.
   * This uses the SDK's canUseTool API.
   */
  createCallback() {
    return async (
      toolName: string,
      toolInput: Record<string, unknown>,
      options: {
        signal: AbortSignal;
        suggestions?: unknown[];
      }
    ): Promise<PermissionResult> => {
      try {
        // Check Accept mode FIRST - auto-approve ALL tools when active
        // This allows dynamic mode switching without session restart
        const acceptModeActive = this.acceptModeGetter?.() ?? false;
        logger.debug({ toolName, acceptModeActive }, 'Permission check');

        if (acceptModeActive) {
          logger.debug({ toolName }, 'Accept mode active - auto-approving tool');
          return {
            behavior: 'allow',
            updatedInput: toolInput,
          };
        }

        // Capture file snapshot BEFORE Write/Edit tools execute (for checkpointing)
        if ((toolName === 'Write' || toolName === 'Edit') && this.snapshotCallback) {
          try {
            await this.snapshotCallback(toolName, toolInput, null);
          } catch (error) {
            // Don't block tool execution if snapshot fails
            logger.warn({ toolName, error }, 'Failed to capture snapshot');
          }
        }

        // Check if this tool is in the always-allowed list
        if (this.isAlwaysAllowed(toolName)) {
          return {
            behavior: 'allow',
            updatedInput: toolInput,
          };
        }

        // Request permission
        if (this.requestCallback) {
          try {
            const result = await this.requestCallback(toolName, toolInput, options);

            // Handle "always" choice (not applicable to AskUserQuestion)
            if (result.always && toolName !== 'AskUserQuestion') {
              this.addAlwaysAllowed(toolName);
            }

            // Return based on decision
            if (result.decision === 'approve') {
              // For ExitPlanMode, include permission updates to set mode back to 'default'
              // This tells the SDK to change the permission mode for the session
              const updatedPermissions: PermissionUpdate[] | undefined =
                toolName === 'ExitPlanMode'
                  ? [{ type: 'setMode', mode: 'default', destination: 'session' }]
                  : undefined;

              // For AskUserQuestion, include the answers in updatedInput
              // SDK expects: { questions: [...], answers: { "question text": "answer" } }
              let updatedInput = toolInput;
              if (toolName === 'AskUserQuestion' && result.answers) {
                updatedInput = {
                  ...toolInput,
                  answers: result.answers,
                };
                logger.debug({ answers: result.answers }, 'AskUserQuestion answers received');
              }

              return {
                behavior: 'allow',
                updatedInput,
                updatedPermissions,
              };
            }

            return {
              behavior: 'deny',
              message: localize('orbit.permissionDenied', 'User denied permission'),
              interrupt: false,
            };
          } catch (error) {
            // If permission request fails, deny to avoid silent auto-approval
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(
              { toolName, error: errorMessage, signalAborted: options.signal.aborted },
              `[ERROR] Permission request failed for ${toolName} - DENYING`
            );
            return {
              behavior: 'deny',
              message: localize(
                'orbit.permissionFailed',
                'Permission request failed. Please try again.'
              ),
              interrupt: false,
            };
          }
        }

        // No callback, auto-allow (development mode)
        return {
          behavior: 'allow',
          updatedInput: toolInput,
        };
      } catch (error) {
        // Catch-all: if ANYTHING goes wrong in the callback, deny to avoid silent auto-approval
        logger.error(
          { error },
          'CRITICAL: Permission callback crashed - DENYING to prevent silent approval'
        );
        return {
          behavior: 'deny',
          message: localize(
            'orbit.permissionSystemError',
            'Permission system error. Please try again.'
          ),
          interrupt: false,
        };
      }
    };
  }
}

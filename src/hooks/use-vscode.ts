import { useEffect, useState, useCallback, useRef } from 'react';

interface VSCodeAPI {
  postMessage(message: unknown): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VSCodeAPI;
  }
}

export interface VSCodeMessage {
  type: string;
  [key: string]: unknown;
}

export interface UseVSCodeReturn {
  sendMessage: (message: VSCodeMessage) => void;
  isConnected: boolean;
  isMockMode: boolean;
}

/**
 * Hook for VS Code webview postMessage bridge
 * Handles message sending/receiving and mock mode for development
 */
export function useVSCode(
  onMessage?: (message: MessageEvent<VSCodeMessage>) => void
): UseVSCodeReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isMockMode, setIsMockMode] = useState(false);
  const vscodeApiRef = useRef<VSCodeAPI | null>(null);

  useEffect(() => {
    // Try to acquire VS Code API
    if (typeof window.acquireVsCodeApi !== 'undefined') {
      try {
        vscodeApiRef.current = window.acquireVsCodeApi();
        setIsConnected(true);
        setIsMockMode(false);
      } catch (error) {
        console.warn('Failed to acquire VS Code API:', error);
        setIsConnected(false);
        setIsMockMode(true);
      }
    } else {
      // Development mode - no VS Code API available
      console.warn('Running in mock mode (no VS Code API available)');
      setIsConnected(false);
      setIsMockMode(true);
    }
  }, []);

  useEffect(() => {
    if (!onMessage) return;

    const handleMessage = (event: MessageEvent<VSCodeMessage>): void => {
      // In VS Code webview, messages come from the extension host
      // In development, we might receive messages from our mock handler
      onMessage(event);
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [onMessage]);

  const sendMessage = useCallback(
    (message: VSCodeMessage) => {
      if (vscodeApiRef.current) {
        // Send to VS Code extension
        vscodeApiRef.current.postMessage(message);
      } else if (isMockMode) {
        // Mock mode - log the message
        console.warn('[Mock VSCode] Sending message:', message);

        // Optionally simulate a response for testing
        if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
          setTimeout(() => {
            const mockResponse = createMockResponse(message);
            if (mockResponse) {
              window.postMessage(mockResponse, '*');
            }
          }, 100);
        }
      } else {
        console.error('Cannot send message: VS Code API not available');
      }
    },
    [isMockMode]
  );

  return {
    sendMessage,
    isConnected,
    isMockMode,
  };
}

/**
 * Create mock responses for development/testing
 */
function createMockResponse(message: VSCodeMessage): VSCodeMessage | null {
  switch (message.type) {
    case 'agent.start':
      return {
        type: 'agent.started',
        taskId: 'mock-task-id',
        timestamp: Date.now(),
      };

    case 'chat.sendMessage':
      return {
        type: 'chat.messageReceived',
        messageId: 'mock-message-id',
        content: `Mock response to: ${String(message['content'])}`,
        timestamp: Date.now(),
      };

    case 'file.open':
      return {
        type: 'file.opened',
        path: message['path'],
        content: '// Mock file content',
        timestamp: Date.now(),
      };

    case 'terminal.createSession':
      return {
        type: 'terminal.sessionCreated',
        sessionId: 'mock-session-id',
        timestamp: Date.now(),
      };

    default:
      return null;
  }
}

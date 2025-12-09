/**
 * VS Code API types
 */
interface VSCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

// Declare global acquireVsCodeApi
declare function acquireVsCodeApi(): VSCodeApi;

/**
 * Message types that can be sent to VS Code
 */
export interface VSCodeMessage<T = unknown> {
  type: string;
  payload: T;
}

/**
 * Message handler callback type
 */
export type MessageHandler<T = unknown> = (message: VSCodeMessage<T>) => void;

/**
 * Cached VS Code API instance
 */
let vscodeApi: VSCodeApi | null = null;

/**
 * Mock VS Code API for development outside of VS Code
 */
const mockVSCodeApi: VSCodeApi = {
  postMessage: (message: unknown): void => {
    console.warn('[Mock VS Code API] postMessage:', message);
  },
  getState: (): unknown => {
    const state = localStorage.getItem('vscode-state');
    return state ? JSON.parse(state) : null;
  },
  setState: (state: unknown): void => {
    localStorage.setItem('vscode-state', JSON.stringify(state));
  },
};

/**
 * Detects if code is running inside VS Code webview
 */
export function isVSCodeEnvironment(): boolean {
  return typeof acquireVsCodeApi !== 'undefined';
}

/**
 * Gets the VS Code API or returns a mock implementation
 * @returns VS Code API instance or mock
 */
export function getVSCodeAPI(): VSCodeApi {
  if (vscodeApi) {
    return vscodeApi;
  }

  if (isVSCodeEnvironment()) {
    try {
      vscodeApi = acquireVsCodeApi();
      return vscodeApi;
    } catch (error) {
      console.warn('Failed to acquire VS Code API, using mock:', error);
      vscodeApi = mockVSCodeApi;
      return mockVSCodeApi;
    }
  }

  vscodeApi = mockVSCodeApi;
  return mockVSCodeApi;
}

/**
 * Sends a message to VS Code
 * @param type - Message type identifier
 * @param payload - Message payload
 */
export function postMessage(type: string, payload: unknown): void {
  const api = getVSCodeAPI();
  const message = { type, payload };
  api.postMessage(message);
}

/**
 * Registers a message handler for messages from VS Code
 * @param handler - Callback function to handle messages
 * @returns Cleanup function to remove the listener
 */
export function onMessage<T = unknown>(
  handler: MessageHandler<T>
): () => void {
  const listener = (event: MessageEvent<VSCodeMessage<T>>): void => {
    handler(event.data);
  };

  window.addEventListener('message', listener);

  return (): void => {
    window.removeEventListener('message', listener);
  };
}

/**
 * Gets persisted state from VS Code
 * @returns The persisted state or null
 */
export function getState(): unknown {
  const api = getVSCodeAPI();
  return api.getState();
}

/**
 * Persists state to VS Code
 * @param state - State to persist
 */
export function setState(state: unknown): void {
  const api = getVSCodeAPI();
  api.setState(state);
}

/**
 * Type-safe message sender factory
 * Creates a typed function for sending specific message types
 */
export function createMessageSender(type: string): (payload?: unknown) => void {
  return (payload?: unknown): void => {
    postMessage(type, payload);
  };
}

/**
 * Type-safe message listener factory
 * Creates a typed listener for specific message types
 */
export function createMessageListener(
  type: string,
  handler: (payload?: unknown) => void
): () => void {
  return onMessage((message) => {
    if (message.type === type) {
      handler(message.payload);
    }
  });
}

/**
 * Type declarations for CSS imports
 */

declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}

declare module '@xyflow/react/dist/style.css';

/**
 * React 19 JSX namespace compatibility
 *
 * React 19 removed the global JSX namespace for better compatibility with
 * other JSX libraries. Many third-party packages still reference the global
 * JSX namespace, causing "cannot be used as a JSX component" errors.
 *
 * This re-exports React's JSX types to the global namespace as a workaround.
 * @see https://github.com/react-icons/react-icons/issues/1006
 * @see https://github.com/facebook/react/issues/28718
 */
declare global {
  namespace JSX {
    type Element = React.JSX.Element;
    type ElementClass = React.JSX.ElementClass;
    type IntrinsicElements = React.JSX.IntrinsicElements;
  }
}

/**
 * VS Code Webview API types
 */
interface VSCodeAPI {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

declare global {
  interface Window {
    vscode?: VSCodeAPI;
    acquireVsCodeApi?: () => VSCodeAPI;
  }
}

export {};

/**
 * Type declarations for react-grab global API.
 *
 * react-grab injects into the embedded browser and exposes its API on
 * `window.__REACT_GRAB__`. These types describe the subset we use for
 * element selection in the Orbit browser panel.
 *
 * @see https://github.com/aidenybai/react-grab
 */

interface ReactGrabSourceInfo {
  filePath: string;
  lineNumber: number | null;
  componentName: string | null;
}

interface ReactGrabPlugin {
  name: string;
  hooks?: {
    onActivate?: () => void;
    onDeactivate?: () => void;
    onElementHover?: (element: Element) => void;
    onElementSelect?: (element: Element) => boolean | undefined | Promise<boolean>;
    onBeforeCopy?: (elements: Element[]) => void | Promise<void>;
    onAfterCopy?: (elements: Element[], success: boolean) => void;
  };
  theme?: {
    toolbar?: { enabled?: boolean };
    crosshair?: { enabled?: boolean };
    selectionBox?: { enabled?: boolean };
    grabbedBoxes?: { enabled?: boolean };
    elementLabel?: { enabled?: boolean };
  };
  options?: {
    activationMode?: 'toggle' | 'hold';
    activationKey?: string | ((event: KeyboardEvent) => boolean);
    freezeReactUpdates?: boolean;
  };
}

interface ReactGrabAPI {
  activate: () => void;
  deactivate: () => void;
  toggle: () => void;
  isActive: () => boolean;
  isEnabled: () => boolean;
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
  getSource: (element: Element) => Promise<ReactGrabSourceInfo | null>;
  getDisplayName: (element: Element) => string | null;
  registerPlugin: (plugin: ReactGrabPlugin) => void;
  unregisterPlugin: (name: string) => void;
  getPlugins: () => string[];
}

declare global {
  interface Window {
    __REACT_GRAB__?: ReactGrabAPI;
  }
}

export type { ReactGrabAPI, ReactGrabPlugin, ReactGrabSourceInfo };

import { createContext, useContext, useEffect, useState } from 'react';

import type { FC, ReactNode } from 'react';

// VS Code API types
interface VSCodeAPI {
  postMessage(message: unknown): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VSCodeAPI;
  }
}

interface VSCodeContextValue {
  vscode: VSCodeAPI | null;
  isVSCode: boolean;
  postMessage: (message: unknown) => void;
}

const VSCodeContext = createContext<VSCodeContextValue | undefined>(undefined);

export interface VSCodeProviderProps {
  children: ReactNode;
}

export const VSCodeProvider: FC<VSCodeProviderProps> = ({ children }) => {
  const [vscode, setVscode] = useState<VSCodeAPI | null>(null);
  const [isVSCode, setIsVSCode] = useState(false);

  useEffect(() => {
    // Check if running inside VS Code webview
    if (typeof window.acquireVsCodeApi === 'function') {
      const api = window.acquireVsCodeApi();
      setVscode(api);
      setIsVSCode(true);
    }
  }, []);

  const postMessage = (message: unknown): void => {
    if (vscode) {
      vscode.postMessage(message);
    } else {
      console.warn('[VSCode] Message would be sent:', message);
    }
  };

  return (
    <VSCodeContext.Provider value={{ vscode, isVSCode, postMessage }}>
      {children}
    </VSCodeContext.Provider>
  );
};

export const useVSCode = (): VSCodeContextValue => {
  const context = useContext(VSCodeContext);
  if (context === undefined) {
    throw new Error('useVSCode must be used within a VSCodeProvider');
  }
  return context;
};

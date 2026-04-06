import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';

export const ToolWidgetSessionContext = createContext<string>('');
export const ToolWidgetLayoutFrozenContext = createContext(false);

const expandedState = new Map<string, boolean>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => {
    listener();
  });
}

export function clearToolWidgetState(): void {
  expandedState.clear();
  notify();
}

export function useToolWidgetMotionDisabled(): boolean {
  return useContext(ToolWidgetLayoutFrozenContext);
}

export function useToolWidgetExpanded(
  toolId: string,
  defaultExpanded = false
): [boolean, () => void] {
  const sessionId = useContext(ToolWidgetSessionContext);
  const key = `${sessionId}:${toolId}`;

  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener);
    return (): void => {
      listeners.delete(listener);
    };
  }, []);

  const getSnapshot = useCallback((): boolean => {
    return expandedState.get(key) ?? defaultExpanded;
  }, [defaultExpanded, key]);

  const value = useSyncExternalStore(subscribe, getSnapshot);

  const toggle = useCallback((): void => {
    const current = expandedState.get(key) ?? defaultExpanded;
    expandedState.set(key, !current);
    notify();
  }, [defaultExpanded, key]);

  return [value, toggle];
}

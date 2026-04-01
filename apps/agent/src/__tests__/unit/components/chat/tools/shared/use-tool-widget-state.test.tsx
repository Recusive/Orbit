import { act, renderHook } from '@testing-library/react';

import type { FC, ReactNode } from 'react';

import {
  clearToolWidgetState,
  ToolWidgetSessionContext,
  useToolWidgetExpanded,
} from '@/components/chat/tools/shared';

interface HookArgs {
  readonly toolId: string;
  readonly defaultExpanded?: boolean;
}

interface RenderExpandedHookResult {
  readonly result: {
    readonly current: [boolean, () => void];
  };
  readonly setSessionId: (nextSessionId: string) => void;
  readonly rerenderHook: (nextProps: HookArgs) => void;
  readonly unmount: () => void;
}

function renderExpandedHook(
  options: HookArgs & { readonly sessionId: string }
): RenderExpandedHookResult {
  let currentSessionId = options.sessionId;
  let currentProps: HookArgs =
    options.defaultExpanded === undefined
      ? { toolId: options.toolId }
      : { toolId: options.toolId, defaultExpanded: options.defaultExpanded };

  const SessionWrapper: FC<{ readonly children?: ReactNode }> = ({ children }) => (
    <ToolWidgetSessionContext.Provider value={currentSessionId}>
      {children}
    </ToolWidgetSessionContext.Provider>
  );

  const hook = renderHook(
    ({ toolId, defaultExpanded }: HookArgs) => {
      return useToolWidgetExpanded(toolId, defaultExpanded);
    },
    {
      initialProps: currentProps,
      wrapper: SessionWrapper,
    }
  );

  return {
    result: hook.result,
    rerenderHook: (nextProps: HookArgs): void => {
      currentProps = nextProps;
      hook.rerender(nextProps);
    },
    setSessionId: (nextSessionId: string): void => {
      currentSessionId = nextSessionId;
      hook.rerender(currentProps);
    },
    unmount: hook.unmount,
  };
}

describe('useToolWidgetExpanded', () => {
  beforeEach(() => {
    clearToolWidgetState();
  });

  it('returns the default collapsed value when no state exists', () => {
    const { result } = renderExpandedHook({
      sessionId: 'session-a',
      toolId: 'tool-1',
    });

    expect(result.current[0]).toBe(false);
  });

  it('persists the expanded state across unmount and remount', () => {
    const initialProps = {
      sessionId: 'session-a',
      toolId: 'tool-1',
    };

    const { result, unmount } = renderExpandedHook(initialProps);

    act(() => {
      result.current[1]();
    });

    expect(result.current[0]).toBe(true);

    unmount();

    const { result: remounted } = renderExpandedHook(initialProps);
    expect(remounted.current[0]).toBe(true);
  });

  it('toggles correctly when the default state starts expanded', () => {
    const { result } = renderExpandedHook({
      sessionId: 'session-a',
      toolId: 'tool-1',
      defaultExpanded: true,
    });

    expect(result.current[0]).toBe(true);

    act(() => {
      result.current[1]();
    });

    expect(result.current[0]).toBe(false);

    act(() => {
      result.current[1]();
    });

    expect(result.current[0]).toBe(true);
  });

  it('scopes state by session and restores the previous session when switching back', () => {
    const { result, setSessionId } = renderExpandedHook({
      sessionId: 'session-a',
      toolId: 'tool-1',
    });

    act(() => {
      result.current[1]();
    });

    expect(result.current[0]).toBe(true);

    setSessionId('session-b');

    expect(result.current[0]).toBe(false);

    act(() => {
      result.current[1]();
    });

    expect(result.current[0]).toBe(true);

    setSessionId('session-a');

    expect(result.current[0]).toBe(true);
  });

  it('clears all persisted entries across sessions', () => {
    const { result, setSessionId } = renderExpandedHook({
      sessionId: 'session-a',
      toolId: 'tool-1',
    });

    act(() => {
      result.current[1]();
    });

    setSessionId('session-b');

    act(() => {
      result.current[1]();
    });

    expect(result.current[0]).toBe(true);

    act(() => {
      clearToolWidgetState();
    });

    expect(result.current[0]).toBe(false);

    setSessionId('session-a');

    expect(result.current[0]).toBe(false);
  });
});

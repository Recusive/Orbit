import { render } from '@testing-library/react';
import { createContext } from 'react';

import type { HTMLAttributes, ReactNode } from 'react';

const {
  mockGetShiki,
  mockUseReducedMotion,
  mockUseToolWidgetExpanded,
  mockUseToolWidgetMotionDisabled,
} = vi.hoisted(() => ({
  mockGetShiki: vi.fn(() => new Promise(() => undefined)),
  mockUseReducedMotion: vi.fn(() => true),
  mockUseToolWidgetExpanded: vi.fn(() => [true, vi.fn()] as const),
  mockUseToolWidgetMotionDisabled: vi.fn(() => false),
}));

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { readonly children: ReactNode }) => <>{children}</>,
  motion: {
    div: (props: HTMLAttributes<HTMLDivElement>) => {
      const nextProps = { ...props };
      Reflect.deleteProperty(nextProps, 'initial');
      Reflect.deleteProperty(nextProps, 'animate');
      Reflect.deleteProperty(nextProps, 'exit');
      Reflect.deleteProperty(nextProps, 'transition');
      return <div {...nextProps}>{props.children}</div>;
    },
  },
  useReducedMotion: mockUseReducedMotion,
}));

vi.mock('@/components/chat/tools/shared', () => ({
  TOOL_EXPAND_ENTER: {},
  TOOL_EXPAND_EXIT: {},
  TOOL_EXPAND_TRANSITION_NONE: {},
  ToolWidgetSessionContext: createContext(''),
  getShiki: mockGetShiki,
  useBeginSessionLayoutMutation: () => () => ({ complete: vi.fn() }),
  useIsDarkMode: () => false,
  useToolWidgetExpanded: mockUseToolWidgetExpanded,
  useToolWidgetMotionDisabled: mockUseToolWidgetMotionDisabled,
}));

import { BashToolWidget } from '@/components/chat/tools/bash-tool-widget';

describe('bash tool widget stability', () => {
  beforeEach(() => {
    mockGetShiki.mockClear();
    mockUseReducedMotion.mockClear();
    mockUseToolWidgetExpanded.mockClear();
    mockUseToolWidgetMotionDisabled.mockClear();
  });

  it('reserves command and output shell height while Shiki highlighting is pending', () => {
    const { container } = render(
      <BashToolWidget
        toolId="bash-1"
        command={'echo one\necho two'}
        output={'first line\nsecond line\nthird line'}
        isRunning={false}
        success={true}
      />
    );

    const commandShell = container.querySelector<HTMLElement>('.bash-command-shell');
    const outputShell = container.querySelector<HTMLElement>('.bash-output-shell');

    expect(commandShell).toHaveStyle({ minHeight: '52px' });
    expect(outputShell).toHaveStyle({ minHeight: '82px' });
    expect(mockGetShiki).toHaveBeenCalledTimes(2);
  });
});

import { render, screen } from '@testing-library/react';

import type { HTMLAttributes, ReactNode } from 'react';

const { mockPreloadFileDiff, mockUseToolWidgetExpanded, mockUseReducedMotion } = vi.hoisted(() => ({
  mockPreloadFileDiff: vi.fn(() => new Promise(() => undefined)),
  mockUseToolWidgetExpanded: vi.fn(() => [true, vi.fn()] as const),
  mockUseReducedMotion: vi.fn(() => true),
}));

vi.mock('@pierre/diffs/react', () => ({
  FileDiff: () => <div data-testid="pierre-file-diff" />,
}));

vi.mock('@pierre/diffs/ssr', () => ({
  preloadFileDiff: mockPreloadFileDiff,
}));

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { readonly children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      ...props
    }: HTMLAttributes<HTMLDivElement> & {
      readonly initial?: unknown;
      readonly animate?: unknown;
      readonly exit?: unknown;
      readonly transition?: unknown;
    }) => <div {...props}>{children}</div>,
  },
  useReducedMotion: mockUseReducedMotion,
}));

vi.mock('@/components/chat/tools/shared', async () => {
  const actual = await vi.importActual('@/components/chat/tools/shared');

  return {
    ...actual,
    useIsDarkMode: () => false,
    useToolWidgetExpanded: mockUseToolWidgetExpanded,
  };
});

import { EditToolWidget } from '@/components/chat/tools/edit-tool-widget';
import { WriteToolWidget } from '@/components/chat/tools/write-tool-widget';

describe('diff preview stabilization', () => {
  beforeEach(() => {
    mockPreloadFileDiff.mockClear();
    mockUseToolWidgetExpanded.mockClear();
    mockUseReducedMotion.mockClear();
  });

  it('reserves height while an edit diff preview is loading', () => {
    render(
      <EditToolWidget
        toolId="edit-1"
        filePath="/tmp/example.ts"
        oldString="old"
        newString="new"
        isRunning={false}
        success={true}
      />
    );

    const loadingPreview = screen.getByText('Loading diff...');
    expect(loadingPreview).toHaveClass('min-h-[12rem]');
    expect(mockPreloadFileDiff).toHaveBeenCalledTimes(1);
  });

  it('reserves height while a write diff preview is loading', () => {
    render(
      <WriteToolWidget
        toolId="write-1"
        filePath="/tmp/example.ts"
        content="updated content"
        isRunning={false}
        success={true}
      />
    );

    const loadingPreview = screen.getByText('Loading diff...');
    expect(loadingPreview).toHaveClass('min-h-[12rem]');
    expect(mockPreloadFileDiff).toHaveBeenCalledTimes(1);
  });
});

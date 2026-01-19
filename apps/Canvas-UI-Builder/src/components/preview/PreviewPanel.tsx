'use client';

import { CANVAS, HEADER, PANEL, ZOOM } from '@canvas/lib/constants';
import { Layers, Minus, Plus } from 'lucide-react';
import { useCallback, useState } from 'react';

import { TabSwitcher } from '../header/TabSwitcher';

import type { InputMode, Model, ThinkingMode } from '@/types/protocol';
import type { FC } from 'react';

import { ChatInput } from '@/components/chat/input';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

type DeviceSize = 'desktop' | 'tablet' | 'mobile';

// ============================================
// Constants
// ============================================

const DEVICE_TABS = [
  { id: 'desktop', label: 'Desktop' },
  { id: 'tablet', label: 'Tablet' },
  { id: 'mobile', label: 'Mobile' },
] as const;

// ============================================
// Main Component
// ============================================

/**
 * Center preview panel showing the canvas and AI prompt input.
 *
 * Layout:
 * - Header with device tabs and zoom controls
 * - Canvas area (dashed border placeholder)
 * - AI input at bottom (uses the same ChatInput from agent)
 */
export const PreviewPanel: FC = () => {
  // Input state - same as agent
  const [inputMode, setInputMode] = useState<InputMode>('default');
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>('off');

  // Preview state
  const [deviceSize, setDeviceSize] = useState<DeviceSize>('desktop');
  const [zoom, setZoom] = useState<number>(ZOOM.default);

  const handleSend = useCallback((text: string): void => {
    // TODO: Implement AI generation for canvas
    // eslint-disable-next-line no-console
    console.log('Canvas generate:', text);
  }, []);

  const handleStop = useCallback((): void => {
    // TODO: Implement stop
  }, []);

  const handleModeChange = useCallback((mode: InputMode): void => {
    setInputMode(mode);
  }, []);

  const handleThinkingModeChange = useCallback((mode: ThinkingMode): void => {
    setThinkingMode(mode);
  }, []);

  const handleModelChange = useCallback((model: Model): void => {
    // TODO: Implement model change for canvas
    // eslint-disable-next-line no-console
    console.log('Model changed:', model);
  }, []);

  const handleZoomIn = useCallback((): void => {
    setZoom((prev) => Math.min(prev + ZOOM.step, ZOOM.max));
  }, []);

  const handleZoomOut = useCallback((): void => {
    setZoom((prev) => Math.max(prev - ZOOM.step, ZOOM.min));
  }, []);

  return (
    <div className={cn('h-full flex flex-col', PANEL.preview.background)}>
      {/* Header */}
      <div
        className={cn(
          'flex items-center justify-between',
          HEADER.height,
          HEADER.padding,
          HEADER.border
        )}
      >
        {/* Device Size Tabs */}
        <TabSwitcher
          tabs={DEVICE_TABS}
          defaultTab={deviceSize}
          onChange={(tabId): void => {
            setDeviceSize(tabId as DeviceSize);
          }}
        />

        {/* Zoom Controls */}
        <div
          className={cn(
            'flex items-center',
            ZOOM.container.gap,
            ZOOM.container.padding,
            ZOOM.container.background,
            ZOOM.container.borderRadius,
            ZOOM.container.border
          )}
        >
          <button
            type="button"
            onClick={handleZoomOut}
            className={cn(ZOOM.button.size, ZOOM.button.base)}
          >
            <Minus className={ZOOM.button.iconSize} />
          </button>
          <span
            className={cn(ZOOM.text.minWidth, ZOOM.text.align, ZOOM.text.fontSize, ZOOM.text.color)}
          >
            {zoom}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            className={cn(ZOOM.button.size, ZOOM.button.base)}
          >
            <Plus className={ZOOM.button.iconSize} />
          </button>
        </div>
      </div>

      {/* Canvas Preview Area */}
      <div className={cn('flex-1 overflow-auto', CANVAS.padding)}>
        <div
          className={cn(
            'h-full flex items-center justify-center',
            CANVAS.minHeight,
            CANVAS.borderRadius,
            CANVAS.border,
            CANVAS.background
          )}
        >
          <div className={cn('text-center', CANVAS.emptyState.textColor)}>
            <Layers
              className={cn(
                'mx-auto',
                CANVAS.emptyState.iconSize,
                CANVAS.emptyState.iconOpacity,
                CANVAS.emptyState.iconMargin
              )}
            />
            <p className={CANVAS.emptyState.textSize}>Drop components here or use AI to generate</p>
          </div>
        </div>
      </div>

      {/* AI Prompt Input - same component as agent */}
      <div>
        <ChatInput
          inputMode={inputMode}
          thinkingMode={thinkingMode}
          isAgentRunning={false}
          fileList={[]}
          usage={{ inputTokens: 0, outputTokens: 0 }}
          maxTokens={200000}
          onSend={handleSend}
          onStop={handleStop}
          onModeChange={handleModeChange}
          onThinkingModeChange={handleThinkingModeChange}
          onModelChange={handleModelChange}
        />
      </div>
    </div>
  );
};

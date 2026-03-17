/**
 * CanvasInputArea - Input component for Canvas UI Builder
 *
 * Wraps the shared ChatInput component with canvas-specific state management.
 * Will be connected to the canvas agent when implemented.
 */
import { createLogger } from '@orbit/common/lib';
import { useCallback, useState } from 'react';

import type { EffortLevel, InputMode, Model, ThinkingMode } from '@/types/protocol';
import type { FC } from 'react';

import { ChatInput } from '@/components/chat/input';

const logger = createLogger('CanvasInputArea');

export const CanvasInputArea: FC = () => {
  // Input state (canvas-specific, will be connected to canvas agent later)
  const [inputMode, setInputMode] = useState<InputMode>('default');
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>('off');
  const [isAgentRunning, setIsAgentRunning] = useState(false);

  // Handlers
  const handleSend = useCallback((text: string): void => {
    // TODO: Connect to canvas agent when implemented
    logger.info('Send message', { text });
    setIsAgentRunning(true);
    // Simulate agent response
    setTimeout(() => {
      setIsAgentRunning(false);
    }, 1000);
  }, []);

  const handleStop = useCallback((): void => {
    setIsAgentRunning(false);
  }, []);

  const handleModeChange = useCallback((mode: InputMode): void => {
    setInputMode(mode);
  }, []);

  const handleThinkingModeChange = useCallback((mode: ThinkingMode): void => {
    setThinkingMode(mode);
  }, []);

  const handleEffortChange = useCallback((effort: EffortLevel): void => {
    logger.debug('Effort change requested', { effort });
  }, []);

  const handleModelChange = useCallback((model: Model): void => {
    logger.debug('Model change requested', { model });
  }, []);

  return (
    <ChatInput
      inputMode={inputMode}
      thinkingMode={thinkingMode}
      effortLevel="high"
      isAgentRunning={isAgentRunning}
      usage={{ inputTokens: 0, outputTokens: 0 }}
      maxTokens={200000}
      onSend={handleSend}
      onStop={handleStop}
      onModeChange={handleModeChange}
      onThinkingModeChange={handleThinkingModeChange}
      onEffortChange={handleEffortChange}
      onModelChange={handleModelChange}
    />
  );
};

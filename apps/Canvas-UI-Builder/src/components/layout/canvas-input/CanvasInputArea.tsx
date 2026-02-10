/**
 * CanvasInputArea - Input component for Canvas UI Builder
 *
 * Wraps the shared ChatInput component with canvas-specific state management.
 * Will be connected to the canvas agent when implemented.
 */
import { useCallback, useState } from 'react';

import type { EffortLevel, InputMode, Model, ThinkingMode } from '@/types/protocol';
import type { FC } from 'react';

import { ChatInput } from '@/components/chat/input';

export const CanvasInputArea: FC = () => {
  // Input state (canvas-specific, will be connected to canvas agent later)
  const [inputMode, setInputMode] = useState<InputMode>('default');
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>('off');
  const [isAgentRunning, setIsAgentRunning] = useState(false);

  // Handlers
  const handleSend = useCallback((text: string): void => {
    // TODO: Connect to canvas agent when implemented
    // eslint-disable-next-line no-console
    console.log('[Canvas] Send message:', text);
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleEffortChange = useCallback((_effort: EffortLevel): void => {
    // Effort changes are handled by the backend - no local state needed
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleModelChange = useCallback((_model: Model): void => {
    // Model changes are handled by the backend - no local state needed
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

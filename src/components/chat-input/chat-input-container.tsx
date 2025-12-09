import React, { useState } from 'react';

import { ContextMenu } from './context-menu';
import { LexicalEditor } from './lexical-editor';
import { ModeSelector } from './mode-selector';
import { ModelSelector } from './model-selector';
import { SubmitButton } from './submit-button';

export interface ChatInputContainerProps {
  onSubmit: (content: string, mode: 'planning' | 'fast', model: string) => void;
  isAgentRunning?: boolean;
  className?: string;
}

export const ChatInputContainer: React.FC<ChatInputContainerProps> = ({
  onSubmit,
  isAgentRunning = false,
  className = '',
}) => {
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<'planning' | 'fast'>('planning');
  const [model, setModel] = useState('claude-opus-4-5');

  const handleSubmit = (): void => {
    if (content.trim() && !isAgentRunning) {
      onSubmit(content, mode, model);
      setContent('');
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className={`border-t border-border bg-background ${className}`}>
      <div className="max-w-4xl mx-auto p-4">
        {/* Editor */}
        <div className="mb-3">
          <LexicalEditor
            onChange={setContent}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything, @ for context"
            disabled={isAgentRunning}
          />
        </div>

        {/* Bottom Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ContextMenu disabled={isAgentRunning} />
            <ModeSelector value={mode} onChange={setMode} disabled={isAgentRunning} />
            <ModelSelector value={model} onChange={setModel} disabled={isAgentRunning} />
          </div>

          <SubmitButton
            onClick={handleSubmit}
            disabled={isAgentRunning || !content.trim()}
          />
        </div>
      </div>
    </div>
  );
};

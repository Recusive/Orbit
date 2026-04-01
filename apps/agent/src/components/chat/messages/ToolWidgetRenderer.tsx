/**
 * ToolWidgetRenderer - Renders the appropriate widget for a tool execution
 *
 * Maps tool names to their corresponding widget components and extracts
 * the necessary props from the tool input/output.
 */
import {
  AskUserQuestionWidget,
  BashToolWidget,
  BrowserToolWidget,
  CodeSearchToolWidget,
  EditToolWidget,
  GenericToolWidget,
  GlobToolWidget,
  GrepToolWidget,
  PlanToolWidget,
  ReadToolWidget,
  SkillToolWidget,
  TaskToolWidget,
  WebFetchToolWidget,
  WebSearchToolWidget,
  WriteToolWidget,
} from '../tools';

import type { ToolExecution } from '@/stores/agent/tool-store';
import type { FC } from 'react';

import { isBrowserTool } from '@/lib/utils/mcp-tools';

export interface ToolWidgetRendererProps {
  readonly tool: ToolExecution;
  readonly onOpenFile: (path: string) => void;
  readonly onOpenUrl: (url: string) => void;
}

/** Extract string from tool input with fallback */
function getStringInput(tool: ToolExecution, key: string, fallback: string): string {
  const value = tool.toolInput[key];
  return typeof value === 'string' ? value : fallback;
}

/** Get common status props for tool widgets */
function getStatusProps(tool: ToolExecution): {
  isRunning: boolean;
  success: boolean | undefined;
  output: string | undefined;
} {
  return {
    isRunning: tool.status === 'running',
    success: tool.status === 'error' ? false : tool.success,
    output: typeof tool.toolOutput === 'string' ? tool.toolOutput : undefined,
  };
}

function hasEditShape(tool: ToolExecution): boolean {
  return (
    typeof tool.toolInput['file_path'] === 'string' &&
    typeof tool.toolInput['old_string'] === 'string' &&
    typeof tool.toolInput['new_string'] === 'string'
  );
}

export const ToolWidgetRenderer: FC<ToolWidgetRendererProps> = ({
  tool,
  onOpenFile,
  onOpenUrl,
}) => {
  const toolName = tool.toolName.toLowerCase();
  const statusProps = getStatusProps(tool);

  switch (toolName) {
    case 'write': {
      const filePath = getStringInput(tool, 'file_path', 'unknown');
      const content = getStringInput(tool, 'content', '');

      // Route plan files to the dedicated PlanToolWidget for markdown preview
      // Use path separator prefix to avoid matching unintended paths like "my.claude/plans/"
      if (filePath.includes('/.claude/plans/') || filePath.includes('\\.claude\\plans\\')) {
        return (
          <PlanToolWidget
            toolId={tool.id}
            filePath={filePath}
            content={content}
            isRunning={statusProps.isRunning}
            success={statusProps.success}
            onOpenFile={onOpenFile}
          />
        );
      }

      return (
        <WriteToolWidget
          toolId={tool.id}
          filePath={filePath}
          content={content}
          isRunning={statusProps.isRunning}
          success={statusProps.success}
          onOpenFile={onOpenFile}
        />
      );
    }

    case 'edit':
      return (
        <EditToolWidget
          toolId={tool.id}
          filePath={getStringInput(tool, 'file_path', 'unknown')}
          oldString={getStringInput(tool, 'old_string', '')}
          newString={getStringInput(tool, 'new_string', '')}
          isRunning={statusProps.isRunning}
          success={statusProps.success}
          onOpenFile={onOpenFile}
        />
      );

    case 'multiedit':
      if (hasEditShape(tool)) {
        return (
          <EditToolWidget
            toolId={tool.id}
            filePath={getStringInput(tool, 'file_path', 'unknown')}
            oldString={getStringInput(tool, 'old_string', '')}
            newString={getStringInput(tool, 'new_string', '')}
            isRunning={statusProps.isRunning}
            success={statusProps.success}
            onOpenFile={onOpenFile}
          />
        );
      }
      return (
        <GenericToolWidget
          toolId={tool.id}
          toolName={tool.toolName}
          toolInput={tool.toolInput}
          toolOutput={tool.toolOutput}
          isRunning={statusProps.isRunning}
          success={statusProps.success}
        />
      );

    case 'read':
      return (
        <ReadToolWidget
          filePath={getStringInput(tool, 'file_path', 'unknown')}
          isRunning={statusProps.isRunning}
          success={statusProps.success}
          content={statusProps.output}
          onOpenFile={onOpenFile}
        />
      );

    case 'bash':
      return (
        <BashToolWidget
          toolId={tool.id}
          command={getStringInput(tool, 'command', '')}
          description={getStringInput(tool, 'description', '')}
          output={statusProps.output}
          isRunning={statusProps.isRunning}
          success={statusProps.success}
        />
      );

    case 'glob':
      return (
        <GlobToolWidget
          toolId={tool.id}
          pattern={getStringInput(tool, 'pattern', '*')}
          path={getStringInput(tool, 'path', '') || undefined}
          output={statusProps.output}
          isRunning={statusProps.isRunning}
          success={statusProps.success}
          onOpenFile={onOpenFile}
        />
      );

    case 'grep':
      return (
        <GrepToolWidget
          toolId={tool.id}
          pattern={getStringInput(tool, 'pattern', '')}
          path={getStringInput(tool, 'path', '') || undefined}
          outputMode={getStringInput(tool, 'output_mode', '') || undefined}
          glob={getStringInput(tool, 'glob', '') || undefined}
          fileType={getStringInput(tool, 'type', '') || undefined}
          output={statusProps.output}
          isRunning={statusProps.isRunning}
          success={statusProps.success}
          onOpenFile={onOpenFile}
        />
      );

    case 'todowrite':
    case 'todoread':
      // Todos are rendered in the persistent TodoBar above the input box.
      // No inline widget needed — prevents repetitive todo snapshots in the stream.
      return null;

    case 'websearch':
      return (
        <WebSearchToolWidget
          toolId={tool.id}
          query={getStringInput(tool, 'query', '')}
          output={statusProps.output}
          isRunning={statusProps.isRunning}
          success={statusProps.success}
          onOpenUrl={onOpenUrl}
        />
      );

    case 'webfetch':
      return (
        <WebFetchToolWidget
          toolId={tool.id}
          url={getStringInput(tool, 'url', '')}
          prompt={getStringInput(tool, 'prompt', '')}
          output={statusProps.output}
          isRunning={statusProps.isRunning}
          success={statusProps.success}
          onOpenUrl={onOpenUrl}
        />
      );

    case 'codesearch':
      return (
        <CodeSearchToolWidget
          toolId={tool.id}
          query={getStringInput(tool, 'query', '')}
          output={statusProps.output}
          isRunning={statusProps.isRunning}
          success={statusProps.success}
        />
      );

    case 'task':
      return (
        <TaskToolWidget
          toolId={tool.id}
          description={getStringInput(tool, 'description', '')}
          prompt={getStringInput(tool, 'prompt', '')}
          subagentType={getStringInput(tool, 'subagent_type', 'general-purpose')}
          model={getStringInput(tool, 'model', '') || undefined}
          output={statusProps.output}
          isRunning={statusProps.isRunning}
          success={statusProps.success}
        />
      );

    case 'question':
    case 'askuserquestion': {
      const questionsInput = tool.toolInput['questions'];
      const rawQuestions = Array.isArray(questionsInput)
        ? (questionsInput as Record<string, unknown>[])
        : [];
      // answers are merged into toolInput at permission-approve time by mergeToolInputAnswers
      const rawAnswers = tool.toolInput['answers'];
      const answers =
        typeof rawAnswers === 'object' && rawAnswers !== null && !Array.isArray(rawAnswers)
          ? (rawAnswers as Record<string, string>)
          : undefined;
      return (
        <AskUserQuestionWidget
          toolId={tool.id}
          questions={rawQuestions}
          answers={answers}
          isRunning={statusProps.isRunning}
          success={statusProps.success}
          output={statusProps.output}
        />
      );
    }

    case 'skill':
      return (
        <SkillToolWidget
          skillName={getStringInput(tool, 'skill', '') || getStringInput(tool, 'args', '')}
          isRunning={statusProps.isRunning}
          success={statusProps.success}
        />
      );

    case 'exitplanmode':
      // ExitPlanMode is handled by the permission modal in ChatInput
      // No widget needed - the plan file Write above shows the plan content
      return null;

    default:
      // Browser MCP tools (mcp__orbit-browser__browser_open, etc.)
      if (isBrowserTool(tool.toolName)) {
        return (
          <BrowserToolWidget
            toolId={tool.id}
            toolName={tool.toolName}
            toolInput={tool.toolInput}
            isRunning={statusProps.isRunning}
            success={statusProps.success}
            onOpenUrl={onOpenUrl}
          />
        );
      }
      return (
        <GenericToolWidget
          toolId={tool.id}
          toolName={tool.toolName}
          toolInput={tool.toolInput}
          toolOutput={tool.toolOutput}
          isRunning={statusProps.isRunning}
          success={statusProps.success}
        />
      );
  }
};

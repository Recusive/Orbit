import { code } from '@streamdown/code';
import { mermaid } from '@streamdown/mermaid';
import { Streamdown } from 'streamdown';

import { OcToolWidget } from './OcToolWidget';

import type { OcPart } from '@/types/opencode';
import type { FC, ReactNode } from 'react';

import { ThinkingBox } from '@/components/chat/status';

const STREAMDOWN_PLUGINS = { code, mermaid };

interface OcMessageItemProps {
  readonly role: 'user' | 'assistant';
  readonly parts: OcPart[];
}

function renderPart(part: OcPart): ReactNode {
  switch (part.type) {
    case 'text':
      return (
        <div className="rounded-xl bg-card/70 px-4 py-3">
          <Streamdown plugins={STREAMDOWN_PLUGINS} mode="static">
            {part.text}
          </Streamdown>
        </div>
      );
    case 'reasoning':
      return (
        <ThinkingBox
          thinking={part.text}
          defaultExpanded={false}
          isStreaming={part.time.end === undefined}
        />
      );
    case 'tool':
      return <OcToolWidget part={part} />;
    case 'file':
      return (
        <div className="rounded-xl border border-border/60 bg-card/70 px-4 py-3 text-sm text-foreground">
          {part.filename ?? part.url}
        </div>
      );
    case 'step-start':
      return (
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Step started</div>
      );
    case 'step-finish':
      return (
        <div className="text-xs text-muted-foreground">
          Step finished · {part.reason} · {String(part.tokens.input + part.tokens.output)} tokens
        </div>
      );
    case 'snapshot':
      return (
        <pre className="overflow-x-auto rounded-xl bg-control-fill px-4 py-3 text-xs text-foreground">
          {part.snapshot}
        </pre>
      );
    case 'patch':
      return (
        <div className="rounded-xl border border-border/60 bg-card/70 px-4 py-3 text-sm text-foreground">
          Patch · {part.files.join(', ')}
        </div>
      );
    case 'agent':
      return <div className="text-xs text-muted-foreground">Agent: {part.name}</div>;
    case 'subtask':
      return (
        <div className="rounded-xl border border-border/60 bg-card/70 px-4 py-3 text-sm text-foreground">
          <div className="font-medium">{part.agent}</div>
          <div className="mt-1 text-muted-foreground">{part.description}</div>
        </div>
      );
    case 'retry':
      return <div className="text-xs text-warning">Retry #{String(part.attempt)}</div>;
    case 'compaction':
      return (
        <div className="text-xs text-muted-foreground">
          Context compacted{part.auto ? ' automatically' : ''}
        </div>
      );
    default:
      return null;
  }
}

export const OcMessageItem: FC<OcMessageItemProps> = ({ role, parts }) => {
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {role}
      </div>
      <div className="space-y-3">
        {parts.map((part) => (
          <div key={part.id}>{renderPart(part)}</div>
        ))}
      </div>
    </div>
  );
};

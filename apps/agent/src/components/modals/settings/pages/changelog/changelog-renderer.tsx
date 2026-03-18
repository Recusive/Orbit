import type { FC, KeyboardEvent, ReactNode } from 'react';

import { useTauri } from '@/hooks/agent/use-tauri';
import { generateUUID } from '@/types/protocol';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

interface HeadingBlock {
  readonly type: 'heading';
  readonly level: number;
  readonly content: string;
}

interface ParagraphBlock {
  readonly type: 'paragraph';
  readonly content: string;
}

interface ListBlock {
  readonly type: 'unordered-list' | 'ordered-list';
  readonly items: readonly string[];
}

interface CodeBlock {
  readonly type: 'code';
  readonly language: string;
  readonly content: string;
}

type MarkdownBlock = HeadingBlock | ParagraphBlock | ListBlock | CodeBlock;

export interface ChangelogRendererProps {
  readonly markdown: string;
}

function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/\r\n/g, '\n').trim();
}

function isSafeLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

function parseMarkdownBlocks(markdown: string): readonly MarkdownBlock[] {
  const normalized = normalizeMarkdown(markdown);
  if (normalized.length === 0) {
    return [];
  }

  const lines = normalized.split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]?.trimEnd() ?? '';

    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    const fenceMatch = /^```(\w+)?\s*$/.exec(line);
    if (fenceMatch) {
      const language = fenceMatch[1] ?? '';
      const content: string[] = [];
      index += 1;

      while (index < lines.length && !/^```$/.test(lines[index] ?? '')) {
        content.push(lines[index] ?? '');
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      blocks.push({
        type: 'code',
        language,
        content: content.join('\n'),
      });
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    const headingLevel = headingMatch?.[1];
    const headingContent = headingMatch?.[2];
    if (headingLevel && headingContent) {
      blocks.push({
        type: 'heading',
        level: headingLevel.length,
        content: headingContent.trim(),
      });
      index += 1;
      continue;
    }

    const unorderedMatch = /^[-*]\s+(.+)$/.exec(line);
    if (unorderedMatch?.[1]) {
      const items: string[] = [];

      while (index < lines.length) {
        const currentLine = lines[index]?.trimEnd() ?? '';
        const currentMatch = /^[-*]\s+(.+)$/.exec(currentLine);
        if (!currentMatch?.[1]) {
          break;
        }

        items.push(currentMatch[1].trim());
        index += 1;
      }

      blocks.push({
        type: 'unordered-list',
        items,
      });
      continue;
    }

    const orderedMatch = /^\d+\.\s+(.+)$/.exec(line);
    if (orderedMatch?.[1]) {
      const items: string[] = [];

      while (index < lines.length) {
        const currentLine = lines[index]?.trimEnd() ?? '';
        const currentMatch = /^\d+\.\s+(.+)$/.exec(currentLine);
        if (!currentMatch?.[1]) {
          break;
        }

        items.push(currentMatch[1].trim());
        index += 1;
      }

      blocks.push({
        type: 'ordered-list',
        items,
      });
      continue;
    }

    const paragraphLines: string[] = [];

    while (index < lines.length) {
      const currentLine = lines[index]?.trimEnd() ?? '';
      if (
        currentLine.trim().length === 0 ||
        currentLine.startsWith('```') ||
        /^(#{1,6})\s+/.test(currentLine) ||
        /^[-*]\s+/.test(currentLine) ||
        /^\d+\.\s+/.test(currentLine)
      ) {
        break;
      }

      paragraphLines.push(currentLine.trim());
      index += 1;
    }

    blocks.push({
      type: 'paragraph',
      content: paragraphLines.join(' '),
    });
  }

  return blocks;
}

function renderInlineContent(
  text: string,
  keyPrefix: string,
  openUrl: (url: string) => void
): readonly ReactNode[] {
  const parts: ReactNode[] = [];
  const tokenPattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\((?:[^()]|\([^)]*\))*\))/g;
  let lastIndex = 0;
  let partIndex = 0;

  for (const match of text.matchAll(tokenPattern)) {
    const token = match[0];
    const tokenIndex = match.index;
    const partKey = String(partIndex);

    if (tokenIndex > lastIndex) {
      parts.push(text.slice(lastIndex, tokenIndex));
    }

    if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={`${keyPrefix}-code-${partKey}`}
          className="whitespace-pre-wrap rounded-[0.4rem] border border-border/50 bg-foreground/5 px-1 py-px font-mono text-[0.85em] text-primary"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={`${keyPrefix}-strong-${partKey}`} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      const linkMatch = /^\[([^\]]+)\]\(((?:[^()]|\([^)]*\))*)\)$/.exec(token);
      const label = linkMatch?.[1];
      const url = linkMatch?.[2];

      if (label && url && isSafeLink(url)) {
        const handleKeyDown = (event: KeyboardEvent<HTMLAnchorElement>): void => {
          if (event.key !== 'Enter' && event.key !== ' ') {
            return;
          }

          event.preventDefault();
          openUrl(url);
        };

        parts.push(
          <a
            key={`${keyPrefix}-link-${partKey}`}
            role="link"
            tabIndex={0}
            onClick={(event) => {
              event.preventDefault();
              openUrl(url);
            }}
            onKeyDown={handleKeyDown}
            className="cursor-pointer text-primary underline underline-offset-2 transition-[color] duration-150 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          >
            {label}
          </a>
        );
      } else {
        parts.push(label ?? token);
      }
    }

    lastIndex = tokenIndex + token.length;
    partIndex += 1;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

export const ChangelogRenderer: FC<ChangelogRendererProps> = ({ markdown }) => {
  const { postMessage } = useTauri({});

  const openUrl = (url: string): void => {
    postMessage({
      type: 'url:open',
      uuid: generateUUID(),
      url,
    });
  };

  const blocks = parseMarkdownBlocks(markdown);

  if (blocks.length === 0) {
    return (
      <p className="text-[13px] leading-relaxed text-muted-foreground/50">
        No release notes available.
      </p>
    );
  }

  return (
    <div className="space-y-3 text-[13px] leading-relaxed text-foreground/70">
      {blocks.map((block, index) => {
        const blockKey = String(index);

        switch (block.type) {
          case 'heading': {
            const className =
              block.level <= 2
                ? 'mt-1 text-[13px] font-semibold tracking-tight text-foreground'
                : 'mt-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60';

            return (
              <h3 key={`heading-${blockKey}`} className={className}>
                {renderInlineContent(block.content, `heading-${blockKey}`, openUrl)}
              </h3>
            );
          }

          case 'unordered-list':
            return (
              <ul
                key={`ul-${blockKey}`}
                className="list-disc space-y-0.5 pl-5 marker:text-muted-foreground/30"
              >
                {block.items.map((item, itemIndex) => {
                  const itemKey = String(itemIndex);

                  return (
                    <li key={`ul-${blockKey}-${itemKey}`}>
                      {renderInlineContent(item, `ul-${blockKey}-${itemKey}`, openUrl)}
                    </li>
                  );
                })}
              </ul>
            );

          case 'ordered-list':
            return (
              <ol
                key={`ol-${blockKey}`}
                className="list-decimal space-y-0.5 pl-5 marker:text-muted-foreground/30"
              >
                {block.items.map((item, itemIndex) => {
                  const itemKey = String(itemIndex);

                  return (
                    <li key={`ol-${blockKey}-${itemKey}`}>
                      {renderInlineContent(item, `ol-${blockKey}-${itemKey}`, openUrl)}
                    </li>
                  );
                })}
              </ol>
            );

          case 'code':
            return (
              <pre
                key={`code-${blockKey}`}
                className="overflow-x-auto rounded-[12px] border border-lg-border bg-control-fill px-3 py-2 text-[12px] leading-5 text-foreground/85"
              >
                <code data-language={block.language || undefined}>{block.content}</code>
              </pre>
            );

          case 'paragraph':
            return (
              <p
                key={`paragraph-${blockKey}`}
                className="text-[13px] leading-relaxed text-foreground/70"
              >
                {renderInlineContent(block.content, `paragraph-${blockKey}`, openUrl)}
              </p>
            );
        }
      })}
    </div>
  );
};

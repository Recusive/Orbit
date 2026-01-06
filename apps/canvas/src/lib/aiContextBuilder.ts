/**
 * AI Context Builder
 * Aggregates content from selected cards and connected cards for AI consumption
 */

import type {
  MarkdownCard,
  WorkflowConnection,
  LineRange,
  ContextFlowType,
} from '../types/workflowTypes';

// ============================================================================
// Types
// ============================================================================

export interface CardContext {
  cardId: string;
  cardName: string;
  cardType: string;
  content: string;
  selectedLines?: string[];
  tags: string[];
  isDirectlySelected: boolean;
  connectionLabel?: string;
  contextFlow?: ContextFlowType;
}

export interface AIContext {
  selectedCards: CardContext[];
  connectedCards: CardContext[];
  totalTokenEstimate: number;
  formattedContext: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract specific lines from content based on line ranges
 */
function extractLines(content: string, ranges: LineRange[]): string[] {
  const lines = content.split('\n');
  const selectedLines: string[] = [];

  for (const range of ranges) {
    for (let i = range.start; i <= range.end && i < lines.length; i++) {
      const line = lines[i];
      if (line !== undefined) {
        selectedLines.push(line);
      }
    }
  }

  return selectedLines;
}

/**
 * Estimate token count (rough approximation: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Generate a summary of card content (first 200 chars + ellipsis)
 */
function summarizeContent(content: string): string {
  const cleanContent = content.replace(/^#+\s*/gm, '').trim();
  if (cleanContent.length <= 200) {
    return cleanContent;
  }
  return cleanContent.substring(0, 200) + '...';
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Get cards that are connected to the given card
 */
export function getConnectedCards(
  cardId: string,
  cards: MarkdownCard[],
  connections: WorkflowConnection[],
  visited = new Set<string>()
): { card: MarkdownCard; connection: WorkflowConnection }[] {
  // Prevent infinite loops
  if (visited.has(cardId)) {
    return [];
  }
  visited.add(cardId);

  const connectedCards: { card: MarkdownCard; connection: WorkflowConnection }[] = [];

  // Find all connections involving this card
  for (const connection of connections) {
    let targetCardId: string | null = null;

    // Check if this card is the source
    if (connection.sourceCardId === cardId) {
      targetCardId = connection.targetCardId;
    }
    // Check if this card is the target (for bidirectional or incoming)
    else if (connection.targetCardId === cardId && connection.direction === 'bidirectional') {
      targetCardId = connection.sourceCardId;
    }

    // Skip if no context should flow
    if (targetCardId === null || connection.contextFlow === 'none') {
      continue;
    }

    // Find the connected card
    const connectedCard = cards.find((c) => c.id === targetCardId);
    if (connectedCard !== undefined && !visited.has(connectedCard.id)) {
      connectedCards.push({ card: connectedCard, connection });
    }
  }

  // Sort by priority (higher first)
  connectedCards.sort((a, b) => b.connection.priority - a.connection.priority);

  return connectedCards;
}

/**
 * Build context from selected cards and their connections
 */
export function buildContextFromSelection(
  cards: MarkdownCard[],
  connections: WorkflowConnection[],
  selectedCardIds: string[],
  lineSelections: Record<string, LineRange[]> = {}
): AIContext {
  const selectedCards: CardContext[] = [];
  const connectedCards: CardContext[] = [];
  const processedIds = new Set<string>();

  // Process directly selected cards
  for (const cardId of selectedCardIds) {
    const card = cards.find((c) => c.id === cardId);
    if (card === undefined) continue;

    processedIds.add(cardId);

    const lineRanges = lineSelections[cardId];
    const hasLineSelection = lineRanges !== undefined && lineRanges.length > 0;

    const cardContext: CardContext = {
      cardId: card.id,
      cardName: card.name,
      cardType: card.type,
      content: hasLineSelection ? extractLines(card.content, lineRanges).join('\n') : card.content,
      ...(hasLineSelection ? { selectedLines: extractLines(card.content, lineRanges) } : {}),
      tags: card.tags,
      isDirectlySelected: true,
    };

    selectedCards.push(cardContext);

    // Get connected cards
    const connected = getConnectedCards(cardId, cards, connections, new Set(processedIds));
    for (const { card: connectedCard, connection } of connected) {
      if (processedIds.has(connectedCard.id)) continue;
      processedIds.add(connectedCard.id);

      const connectedContext: CardContext = {
        cardId: connectedCard.id,
        cardName: connectedCard.name,
        cardType: connectedCard.type,
        content:
          connection.contextFlow === 'summary'
            ? summarizeContent(connectedCard.content)
            : connectedCard.content,
        tags: connectedCard.tags,
        isDirectlySelected: false,
        connectionLabel: connection.label,
        contextFlow: connection.contextFlow,
      };

      connectedCards.push(connectedContext);
    }
  }

  // Format the context for AI
  const formattedContext = formatContextForAI(selectedCards, connectedCards);
  const totalTokenEstimate = estimateTokens(formattedContext);

  return {
    selectedCards,
    connectedCards,
    totalTokenEstimate,
    formattedContext,
  };
}

/**
 * Format the aggregated context as markdown for AI consumption
 */
export function formatContextForAI(
  selectedCards: CardContext[],
  connectedCards: CardContext[]
): string {
  const sections: string[] = [];

  // Selected cards section
  if (selectedCards.length > 0) {
    sections.push('## Selected Context\n');

    for (const card of selectedCards) {
      sections.push(`### ${card.cardName} (${card.cardType})`);
      if (card.tags.length > 0) {
        sections.push(`Tags: ${card.tags.join(', ')}`);
      }
      if (card.selectedLines !== undefined) {
        sections.push('**Selected lines:**');
      }
      sections.push('```markdown');
      sections.push(card.content);
      sections.push('```');
      sections.push('');
    }
  }

  // Connected cards section
  if (connectedCards.length > 0) {
    sections.push('## Related Context\n');

    for (const card of connectedCards) {
      const flowLabel = card.contextFlow === 'summary' ? ' (summary)' : '';
      const connectionInfo = card.connectionLabel !== undefined ? ` — ${card.connectionLabel}` : '';
      sections.push(`### ${card.cardName}${connectionInfo}${flowLabel}`);
      if (card.tags.length > 0) {
        sections.push(`Tags: ${card.tags.join(', ')}`);
      }
      sections.push('```markdown');
      sections.push(card.content);
      sections.push('```');
      sections.push('');
    }
  }

  return sections.join('\n');
}

/**
 * Get a brief summary of what's in the context
 */
export function getContextSummary(context: AIContext): string {
  const parts: string[] = [];

  if (context.selectedCards.length > 0) {
    parts.push(
      `${String(context.selectedCards.length)} selected card${context.selectedCards.length !== 1 ? 's' : ''}`
    );
  }

  if (context.connectedCards.length > 0) {
    parts.push(
      `${String(context.connectedCards.length)} connected card${context.connectedCards.length !== 1 ? 's' : ''}`
    );
  }

  if (parts.length === 0) {
    return 'No cards selected';
  }

  return `${parts.join(', ')} (~${String(context.totalTokenEstimate)} tokens)`;
}

import type { OcMessage, OcPart } from '@/types/opencode';

/**
 * [warning] TESTED: OpenCode title-loading helpers in this file are covered by
 *     unit and integration tests.
 *     If you modify this, run:
 *     bun run test -- apps/agent/src/__tests__/unit/services/opencode/oc-title-utils.test.ts apps/agent/src/__tests__/integration/services/opencode/oc-title-loading.test.ts
 *     Test files: apps/agent/src/__tests__/unit/services/opencode/oc-title-utils.test.ts, apps/agent/src/__tests__/integration/services/opencode/oc-title-loading.test.ts
 */
const OC_DEFAULT_TITLE_RE =
  /^(New session - |Child session - )\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function isDefaultOcTitle(title: string): boolean {
  return OC_DEFAULT_TITLE_RE.test(title);
}

export function countRealUserMessages(
  messageOrder: readonly string[],
  messagesById: Readonly<Record<string, Pick<OcMessage, 'role'>>>,
  partsByMessage: Readonly<Record<string, readonly OcPart[]>>
): number {
  return messageOrder.filter((messageId) => {
    const message = messagesById[messageId];
    if (message?.role !== 'user') {
      return false;
    }

    const parts = partsByMessage[messageId] ?? [];
    if (parts.length === 0) {
      return true;
    }

    const allSynthetic = parts.every((part) => 'synthetic' in part && part.synthetic);
    return !allSynthetic;
  }).length;
}

interface TitleEligibilityInput {
  readonly title: string;
  readonly parentID?: string | undefined;
  readonly realUserMessageCount: number;
}

export function willBackendGenerateTitle(input: TitleEligibilityInput): boolean {
  return (
    input.parentID === undefined &&
    isDefaultOcTitle(input.title) &&
    input.realUserMessageCount === 0
  );
}

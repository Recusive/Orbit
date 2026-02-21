import { createLogger } from '@orbit/common/lib';

import type { WebviewMessage } from '@/types/protocol';

const logger = createLogger('SkillHandlers');

import { getWorkspacePath, listSkills } from '@/lib/api';

export async function handleSkillsList(
  message: Extract<WebviewMessage, { type: 'skills:list' }>
): Promise<void> {
  try {
    const workspacePath = (await getWorkspacePath()) ?? '/';
    const skills = await listSkills(workspacePath);
    window.postMessage(
      {
        type: 'skills:list:response',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        skills,
      },
      '*'
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to list skills';
    logger.error('List skills error', undefined, { error: errorMessage });
    window.postMessage(
      {
        type: 'skills:error',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        error: errorMessage,
      },
      '*'
    );
  }
}

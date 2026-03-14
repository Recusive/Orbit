import { createLogger } from '@orbit/common/lib';
import { createOrbitClient } from '@orbit.build/sdk/v2/client';

import type { OrbitClient } from '@orbit.build/sdk/v2/client';

const logger = createLogger('OcClient');

let client: OrbitClient | null = null;
let currentPort: number | null = null;
let currentDirectory: string | null = null;

function buildBaseUrl(port: number): string {
  return `http://127.0.0.1:${String(port)}`;
}

export function initClient(port: number, directory: string): OrbitClient {
  currentPort = port;
  currentDirectory = directory;
  client = createOrbitClient({
    baseUrl: buildBaseUrl(port),
    directory,
  });
  logger.info('Client initialized', { port, directory });
  return client;
}

export function getClient(): OrbitClient {
  if (!client) {
    logger.warn('getClient called before initialization');
    throw new Error('OpenCode client not initialized');
  }
  return client;
}

export function hasClient(): boolean {
  return client !== null;
}

export function updateDirectory(directory: string): OrbitClient {
  if (currentPort === null) {
    throw new Error('OpenCode client port not initialized');
  }
  if (client && currentDirectory === directory) {
    return client;
  }
  const previousDirectory = currentDirectory;
  logger.info('Client directory updated', { port: currentPort, directory, previousDirectory });
  return initClient(currentPort, directory);
}

export function destroyClient(): void {
  logger.info('Client destroyed', { port: currentPort, directory: currentDirectory });
  client = null;
  currentPort = null;
  currentDirectory = null;
}

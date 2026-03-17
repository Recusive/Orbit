export * from "./client.js"
export * from "./server.js"

import { createOrbitClient } from "./client.js"
import { createOrbitServer } from "./server.js"

import type { ServerOptions } from "./server.js"

export async function createOrbit(
  options?: ServerOptions,
): Promise<{ client: ReturnType<typeof createOrbitClient>; server: Awaited<ReturnType<typeof createOrbitServer>> }> {
  const server = await createOrbitServer({
    ...options,
  })

  const client = createOrbitClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}

export const createOpencode = createOrbit

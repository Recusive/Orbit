export type * from "./gen/types.gen.js"

import { createClient } from "./gen/client/client.gen.js"
import { OpencodeClient } from "./gen/sdk.gen.js"

import type { Config } from "./gen/client/types.gen.js"

export { type Config as OpencodeClientConfig, OpencodeClient }
export { type Config as OrbitClientConfig, OpencodeClient as OrbitClient }

export function createOrbitClient(config?: Config & { directory?: string }): OpencodeClient {
  let resolvedConfig = { ...config }

  if (!resolvedConfig.fetch) {
    const customFetch = (req: Request): ReturnType<typeof fetch> => {
      ;(req as Request & { timeout: boolean }).timeout = false
      return fetch(req)
    }
    resolvedConfig = {
      ...resolvedConfig,
      fetch: customFetch,
    }
  }

  if (resolvedConfig.directory) {
    resolvedConfig.headers = {
      ...(resolvedConfig.headers as Record<string, string> | undefined),
      "x-opencode-directory": encodeURIComponent(resolvedConfig.directory),
    }
  }

  const client = createClient(resolvedConfig)
  return new OpencodeClient({ client })
}

export const createOpencodeClient = createOrbitClient

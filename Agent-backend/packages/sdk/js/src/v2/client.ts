export type * from "./gen/types.gen.js"

import { createClient } from "./gen/client/client.gen.js"
import { OpencodeClient } from "./gen/sdk.gen.js"

import type { Config } from "./gen/client/types.gen.js"

export { type Config as OpencodeClientConfig, OpencodeClient }
export { type Config as OrbitClientConfig, OpencodeClient as OrbitClient }

export function createOrbitClient(
  config?: Config & { directory?: string; experimental_workspaceID?: string },
): OpencodeClient {
  let resolvedConfig = { ...config }

  if (!resolvedConfig.fetch) {
    const customFetch: typeof fetch = Object.assign(
      (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> => {
        const req = new Request(...args)
        ;(req as Request & { timeout: boolean }).timeout = false
        return fetch(req)
      },
      { preconnect: fetch.preconnect },
    )
    resolvedConfig = {
      ...resolvedConfig,
      fetch: customFetch,
    }
  }

  if (resolvedConfig.directory) {
    const isNonASCII = /[^\x20-\x7E]/.test(resolvedConfig.directory)
    const encodedDirectory = isNonASCII ? encodeURIComponent(resolvedConfig.directory) : resolvedConfig.directory
    resolvedConfig.headers = {
      ...(resolvedConfig.headers as Record<string, string> | undefined),
      "x-opencode-directory": encodedDirectory,
    }
  }

  if (resolvedConfig.experimental_workspaceID) {
    resolvedConfig.headers = {
      ...(resolvedConfig.headers as Record<string, string> | undefined),
      "x-opencode-workspace": resolvedConfig.experimental_workspaceID,
    }
  }

  const client = createClient(resolvedConfig)
  return new OpencodeClient({ client })
}

export const createOpencodeClient = createOrbitClient

import { Config } from "../config/config"

import type { Argv, InferredOptionTypes } from "yargs"

const options = {
  port: {
    type: "number" as const,
    describe: "port to listen on",
    default: 0,
  },
  hostname: {
    type: "string" as const,
    describe: "hostname to listen on",
    default: "127.0.0.1",
  },
  mdns: {
    type: "boolean" as const,
    describe: "enable mDNS service discovery (defaults hostname to 0.0.0.0)",
    default: false,
  },
  "mdns-domain": {
    type: "string" as const,
    describe: "custom domain name for mDNS service (default: orbit.local)",
    default: "orbit.local",
  },
  cors: {
    type: "string" as const,
    array: true,
    describe: "additional domains to allow for CORS",
    default: [] as string[],
  },
}

export type NetworkOptions = InferredOptionTypes<typeof options>

export function withNetworkOptions<T>(yargs: Argv<T>): Argv<T & NetworkOptions> {
  return yargs.options(options) as unknown as Argv<T & NetworkOptions>
}

export async function resolveNetworkOptions(
  args: NetworkOptions,
): Promise<{ hostname: string; port: number; mdns: boolean; mdnsDomain: string; cors: string[] }> {
  const config = await Config.global()
  const portExplicitlySet = process.argv.includes("--port")
  const hostnameExplicitlySet = process.argv.includes("--hostname")
  const mdnsExplicitlySet = process.argv.includes("--mdns")
  const mdnsDomainExplicitlySet = process.argv.includes("--mdns-domain")

  const server = config.server
  const mdns = mdnsExplicitlySet ? args.mdns : (server?.mdns ?? args.mdns)
  const mdnsDomain = mdnsDomainExplicitlySet ? args["mdns-domain"] : (server?.mdnsDomain ?? args["mdns-domain"])
  const port = portExplicitlySet ? args.port : (server?.port ?? args.port)
  const hostname = hostnameExplicitlySet
    ? args.hostname
    : mdns && server?.hostname === undefined
      ? "0.0.0.0"
      : (server?.hostname ?? args.hostname)
  const configCors = server?.cors ?? []
  const argsCors = Array.isArray(args.cors) ? args.cors : [args.cors]
  const cors = [...configCors, ...argsCors]

  return { hostname, port, mdns, mdnsDomain, cors }
}

import { WorkspaceServer } from "../../control-plane/workspace-server/server"
import { withNetworkOptions, resolveNetworkOptions } from "../network"

import { cmd } from "./cmd"

export const WorkspaceServeCommand = cmd({
  command: "workspace-serve",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "starts a remote workspace event server",
  handler: async (args) => {
    const opts = await resolveNetworkOptions(args)
    const server = WorkspaceServer.Listen(opts)
    console.log(`workspace event server listening on http://${String(server.hostname)}:${String(server.port)}/event`)
    await new Promise(() => {
      // keep process alive
    })
    await server.stop()
  },
})

import { Flag } from "../../flag/flag"
import { Server } from "../../server/server"
import { withNetworkOptions, resolveNetworkOptions } from "../network"

import { cmd } from "./cmd"

export const ServeCommand = cmd({
  command: "serve",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "starts a headless orbit server",
  handler: async (args) => {
    if (Flag.OPENCODE_SERVER_PASSWORD === undefined) {
      console.log("Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.")
    }
    const opts = await resolveNetworkOptions(args)
    const server = Server.listen(opts)
    console.log(`orbit server listening on http://${String(server.hostname)}:${String(server.port)}`)

    await new Promise(() => {
      // keep process alive
    })
    await server.stop()
  },
})

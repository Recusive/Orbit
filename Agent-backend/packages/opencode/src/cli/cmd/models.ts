import { EOL } from "os"

import { Instance } from "../../project/instance"
import { ModelsDev } from "../../provider/models"
import { Provider } from "../../provider/provider"
import { UI } from "../ui"

import { cmd } from "./cmd"

import type { Argv } from "yargs"

export const ModelsCommand = cmd({
  command: "models [provider]",
  describe: "list all available models",
  builder: (yargs: Argv) => {
    return yargs
      .positional("provider", {
        describe: "provider ID to filter models by",
        type: "string",
        array: false,
      })
      .option("verbose", {
        describe: "use more verbose model output (includes metadata like costs)",
        type: "boolean",
      })
      .option("refresh", {
        describe: "refresh the models cache from models.dev",
        type: "boolean",
      })
  },
  handler: async (args) => {
    if (args.refresh) {
      await ModelsDev.refresh()
      UI.println(UI.Style.TEXT_SUCCESS_BOLD + "Models cache refreshed" + UI.Style.TEXT_NORMAL)
    }

    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const providers = await Provider.list()

        function printModels(providerID: string, verbose?: boolean): void {
          const provider = providers[providerID]
          const sortedModels = Object.entries(provider.models).sort(([a], [b]) => a.localeCompare(b))
          for (const [modelID, model] of sortedModels) {
            process.stdout.write(`${providerID}/${modelID}`)
            process.stdout.write(EOL)
            if (verbose) {
              process.stdout.write(JSON.stringify(model, null, 2))
              process.stdout.write(EOL)
            }
          }
        }

        if (args.provider) {
          if (!(args.provider in providers)) {
            UI.error(`Provider not found: ${args.provider}`)
            return
          }

          printModels(args.provider, args.verbose)
          return
        }

        const providerIDs = Object.keys(providers).sort((a, b) => {
          const aIsOrbit = a.startsWith("orbit")
          const bIsOrbit = b.startsWith("orbit")
          if (aIsOrbit && !bIsOrbit) return -1
          if (!aIsOrbit && bIsOrbit) return 1
          return a.localeCompare(b)
        })

        for (const providerID of providerIDs) {
          printModels(providerID, args.verbose)
        }
      },
    })
  },
})

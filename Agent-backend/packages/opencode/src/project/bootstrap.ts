import { Bus } from "../bus"
import { Command } from "../command"
import { File } from "../file"
import { FileWatcher } from "../file/watcher"
import { Format } from "../format"
import { LSP } from "../lsp"
import { Plugin } from "../plugin"
import { Snapshot } from "../snapshot"
import { Truncate } from "../tool/truncation"

import { Instance } from "./instance"
import { Project } from "./project"
import { Vcs } from "./vcs"

import { ShareNext } from "@/share/share-next"
import { Log } from "@/util/log"

export async function InstanceBootstrap(): Promise<void> {
  Log.Default.info("bootstrapping", { directory: Instance.directory })
  await Plugin.init()
  ShareNext.init()
  Format.init()
  await LSP.init()
  FileWatcher.init()
  File.init()
  void Vcs.init()
  Snapshot.init()
  Truncate.init()

  Bus.subscribe(Command.Event.Executed, (payload) => {
    if (payload.properties.name === Command.Default.INIT) {
      Project.setInitialized(Instance.project.id)
    }
  })
}

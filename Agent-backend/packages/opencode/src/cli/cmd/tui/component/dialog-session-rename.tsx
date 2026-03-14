import { useSync } from "@tui/context/sync"
import { useDialog } from "@tui/ui/dialog"
import { DialogPrompt } from "@tui/ui/dialog-prompt"
import { createMemo } from "solid-js"

import { useSDK } from "../context/sdk"

import type { JSX } from "solid-js"

interface DialogSessionRenameProps {
  session: string
}

export function DialogSessionRename(props: DialogSessionRenameProps): JSX.Element {
  const dialog = useDialog()
  const sync = useSync()
  const sdk = useSDK()
  const session = createMemo(() => sync.session.get(props.session))

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
  return (
    <DialogPrompt
      title="Rename Session"
      value={session()?.title}
      onConfirm={(value) => {
        void sdk.client.session.update({
          sessionID: props.session,
          title: value,
        })
        dialog.clear()
      }}
      onCancel={() => {
        dialog.clear()
      }}
    />
  )
}

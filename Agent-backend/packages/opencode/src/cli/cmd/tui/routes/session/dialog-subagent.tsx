import { useRoute } from "@tui/context/route"
import { DialogSelect } from "@tui/ui/dialog-select"

import type { JSX } from "solid-js"

export function DialogSubagent(props: { sessionID: string }): JSX.Element {
  const route = useRoute()

  return (
    <DialogSelect
      title="Subagent Actions"
      options={[
        {
          title: "Open",
          value: "subagent.view",
          description: "the subagent's session",
          onSelect: (dialog) => {
            route.navigate({
              type: "session",
              sessionID: props.sessionID,
            })
            dialog.clear()
          },
        },
      ]}
    />
  )
}

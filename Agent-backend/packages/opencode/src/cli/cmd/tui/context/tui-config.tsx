import { createSimpleContext } from "./helper"

import type { TuiConfig } from "@/config/tui"

export const { use: useTuiConfig, provider: TuiConfigProvider } = createSimpleContext({
  name: "TuiConfig",
  init: (props: { config: TuiConfig.Info }) => {
    return props.config
  },
})

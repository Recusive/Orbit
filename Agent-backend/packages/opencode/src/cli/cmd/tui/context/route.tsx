import { createStore } from "solid-js/store"

import { createSimpleContext } from "./helper"

import type { PromptInfo } from "../component/prompt/history"

export interface HomeRoute {
  type: "home"
  initialPrompt?: PromptInfo
  workspaceID?: string
}

export interface SessionRoute {
  type: "session"
  sessionID: string
  initialPrompt?: PromptInfo
}

export type Route = HomeRoute | SessionRoute

export const { use: useRoute, provider: RouteProvider } = createSimpleContext({
  name: "Route",
  init: () => {
    const [store, setStore] = createStore<Route>(
      process.env.OPENCODE_ROUTE
        ? (JSON.parse(process.env.OPENCODE_ROUTE) as Route)
        : {
            type: "home",
          },
    )

    return {
      get data() {
        return store
      },
      navigate(route: Route) {
        console.log("navigate", route)
        setStore(route)
      },
    }
  },
})

export type RouteContext = ReturnType<typeof useRoute>

export function useRouteData<T extends Route["type"]>(_type: T): Extract<Route, { type: T }> {
  const route = useRoute()
  return route.data as Extract<Route, { type: T }>
}

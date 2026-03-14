import { useTerminalDimensions } from "@opentui/solid"
import { SplitBorder } from "@tui/component/border"
import { useCommandDialog } from "@tui/component/dialog-command"
import { useRouteData } from "@tui/context/route"
import { useSync } from "@tui/context/sync"
import { useTheme } from "@tui/context/theme"
import { pipe, sumBy } from "remeda"
import { createMemo, createSignal, Match, Show, Switch } from "solid-js"

import { useKeybind } from "../../context/keybind"

import type { AssistantMessage, Session } from "@orbit.build/sdk/v2"
import type { Accessor, JSX } from "solid-js"

import { Flag } from "@/flag/flag"

function Title(props: { session: Accessor<Session> }): JSX.Element {
  const { theme } = useTheme()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types unresolvable by ESLint type-checker
  return (
    <text fg={theme.text}>
      <span style={{ bold: true }}>#</span> <span style={{ bold: true }}>{props.session().title}</span>
    </text>
  )
}

function ContextInfo(props: { context: Accessor<string | undefined>; cost: Accessor<string> }): JSX.Element {
  const { theme } = useTheme()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types unresolvable by ESLint type-checker
  return (
    <Show when={props.context()}>
      <text fg={theme.textMuted} wrapMode="none" flexShrink={0}>
        {props.context()} ({props.cost()})
      </text>
    </Show>
  )
}

function WorkspaceInfo(props: { workspace: Accessor<string | undefined> }): JSX.Element {
  const { theme } = useTheme()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types unresolvable by ESLint type-checker
  return (
    <Show when={props.workspace()}>
      <text fg={theme.textMuted} wrapMode="none" flexShrink={0}>
        {props.workspace()}
      </text>
    </Show>
  )
}

export function Header(): JSX.Element {
  const route = useRouteData("session")
  const sync = useSync()
  const session = createMemo(() => {
    const s = sync.session.get(route.sessionID)
    if (!s) throw new Error(`Session not found: ${route.sessionID}`)
    return s
  })
  const messages = createMemo(() => sync.data.message[route.sessionID] ?? [])

  const cost = createMemo(() => {
    const total = pipe(
      messages(),
      sumBy((x) => (x.role === "assistant" ? x.cost : 0)),
    )
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(total)
  })

  const context = createMemo(() => {
    const last = messages().findLast((x) => x.role === "assistant" && x.tokens.output > 0) as
      | AssistantMessage
      | undefined
    if (!last) return
    const total =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    const model = sync.data.provider.find((x) => x.id === last.providerID)?.models[last.modelID]
    let result = total.toLocaleString()
    if (model?.limit.context !== undefined && model.limit.context !== 0) {
      result += "  " + String(Math.round((total / model.limit.context) * 100)) + "%"
    }
    return result
  })

  const workspace = createMemo(() => {
    const id = session().workspaceID
    if (!id) return "Workspace local"
    const info = sync.workspace.get(id)
    if (!info) return `Workspace ${id}`
    return `Workspace ${id} (${info.type})`
  })

  const { theme } = useTheme()
  const keybind = useKeybind()
  const command = useCommandDialog()
  const [hover, setHover] = createSignal<"parent" | "prev" | "next" | null>(null)
  const dimensions = useTerminalDimensions()
  const narrow = createMemo(() => dimensions().width < 80)

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types unresolvable by ESLint type-checker
  return (
    <box flexShrink={0}>
      <box
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={1}
        {...SplitBorder}
        border={["left"]}
        borderColor={theme.border}
        flexShrink={0}
        backgroundColor={theme.backgroundPanel}
      >
        <Switch>
          <Match when={session().parentID}>
            <box flexDirection="column" gap={1}>
              <box flexDirection={narrow() ? "column" : "row"} justifyContent="space-between" gap={narrow() ? 1 : 0}>
                {Flag.OPENCODE_EXPERIMENTAL_WORKSPACES ? (
                  <box flexDirection="column">
                    <text fg={theme.text}>
                      <b>Subagent session</b>
                    </text>
                    <WorkspaceInfo workspace={workspace} />
                  </box>
                ) : (
                  <text fg={theme.text}>
                    <b>Subagent session</b>
                  </text>
                )}

                <ContextInfo context={context} cost={cost} />
              </box>
              <box flexDirection="row" gap={2}>
                <box
                  onMouseOver={() => setHover("parent")}
                  onMouseOut={() => setHover(null)}
                  onMouseUp={() => {
                    command.trigger("session.parent")
                  }}
                  backgroundColor={hover() === "parent" ? theme.backgroundElement : theme.backgroundPanel}
                >
                  <text fg={theme.text}>
                    Parent <span style={{ fg: theme.textMuted }}>{keybind.print("session_parent")}</span>
                  </text>
                </box>
                <box
                  onMouseOver={() => setHover("prev")}
                  onMouseOut={() => setHover(null)}
                  onMouseUp={() => {
                    command.trigger("session.child.previous")
                  }}
                  backgroundColor={hover() === "prev" ? theme.backgroundElement : theme.backgroundPanel}
                >
                  <text fg={theme.text}>
                    Prev <span style={{ fg: theme.textMuted }}>{keybind.print("session_child_cycle_reverse")}</span>
                  </text>
                </box>
                <box
                  onMouseOver={() => setHover("next")}
                  onMouseOut={() => setHover(null)}
                  onMouseUp={() => {
                    command.trigger("session.child.next")
                  }}
                  backgroundColor={hover() === "next" ? theme.backgroundElement : theme.backgroundPanel}
                >
                  <text fg={theme.text}>
                    Next <span style={{ fg: theme.textMuted }}>{keybind.print("session_child_cycle")}</span>
                  </text>
                </box>
              </box>
            </box>
          </Match>
          <Match when={true}>
            <box flexDirection={narrow() ? "column" : "row"} justifyContent="space-between" gap={1}>
              {Flag.OPENCODE_EXPERIMENTAL_WORKSPACES ? (
                <box flexDirection="column">
                  <Title session={session} />
                  <WorkspaceInfo workspace={workspace} />
                </box>
              ) : (
                <Title session={session} />
              )}
              <ContextInfo context={context} cost={cost} />
            </box>
          </Match>
        </Switch>
      </box>
    </box>
  )
}

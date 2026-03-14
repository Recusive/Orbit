import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { useSync } from "@tui/context/sync"
import { useDialog } from "@tui/ui/dialog"
import { DialogSelect } from "@tui/ui/dialog-select"
import { Clipboard } from "@tui/util/clipboard"
import { map, pipe, sortBy } from "remeda"
import { createMemo, createSignal, Show } from "solid-js"

import { useSDK } from "../context/sdk"
import { useTheme } from "../context/theme"
import { DialogPrompt } from "../ui/dialog-prompt"
import { Link } from "../ui/link"
import { useToast } from "../ui/toast"

import { DialogModel } from "./dialog-model"

import type { ProviderAuthAuthorization } from "@orbit.build/sdk/v2"
import type { Accessor, JSX } from "solid-js"

const PROVIDER_PRIORITY: Record<string, number> = {
  opencode: 0,
  "opencode-go": 1,
  openai: 2,
  "github-copilot": 3,
  anthropic: 4,
  google: 5,
}

export function createDialogProviderOptions(): Accessor<
  {
    title: string
    value: string
    description: string | undefined
    category: string
    onSelect: () => Promise<void>
  }[]
> {
  const sync = useSync()
  const dialog = useDialog()
  const sdk = useSDK()
  const options = createMemo(() => {
    return pipe(
      sync.data.provider_next.all,
      sortBy((x) => PROVIDER_PRIORITY[x.id] ?? 99),
      map((provider) => ({
        title: provider.name,
        value: provider.id,
        description: {
          opencode: "(Recommended)",
          anthropic: "(Claude Max or API key)",
          openai: "(ChatGPT Plus/Pro or API key)",
          "opencode-go": "Low cost subscription for everyone",
        }[provider.id],
        category: provider.id in PROVIDER_PRIORITY ? "Popular" : "Other",
        async onSelect() {
          const methods = sync.data.provider_auth[provider.id] ?? [
            {
              type: "api",
              label: "API key",
            },
          ]
          let index: number | null = 0
          if (methods.length > 1) {
            index = await new Promise<number | null>((resolve) => {
              dialog.replace(
                () => {
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
                  return (
                    <DialogSelect
                      title="Select auth method"
                      options={methods.map((x, idx) => ({
                        title: x.label,
                        value: idx,
                      }))}
                      onSelect={(option) => {
                        resolve(option.value)
                      }}
                    />
                  )
                },
                () => {
                  resolve(null)
                },
              )
            })
          }
          if (index === null) return
          const method = methods[index]
          if (method.type === "oauth") {
            const result = await sdk.client.provider.oauth.authorize({
              providerID: provider.id,
              method: index,
            })
            if (result.data?.method === "code") {
              const codeAuth = result.data
              const codeIndex = index
              dialog.replace(() => {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
                return (
                  <CodeMethod
                    providerID={provider.id}
                    title={method.label}
                    index={codeIndex}
                    authorization={codeAuth}
                  />
                )
              })
            }
            if (result.data?.method === "auto") {
              const autoAuth = result.data
              const autoIndex = index
              dialog.replace(() => {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
                return (
                  <AutoMethod
                    providerID={provider.id}
                    title={method.label}
                    index={autoIndex}
                    authorization={autoAuth}
                  />
                )
              })
            }
          }
          if (method.type === "api") {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
            dialog.replace(() => <ApiMethod providerID={provider.id} title={method.label} />)
            return
          }
        },
      })),
    )
  })
  return options
}

export function DialogProvider(): JSX.Element {
  const options = createDialogProviderOptions()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
  return <DialogSelect title="Connect a provider" options={options()} />
}

interface AutoMethodProps {
  index: number
  providerID: string
  title: string
  authorization: ProviderAuthAuthorization
}
function AutoMethod(props: AutoMethodProps): JSX.Element {
  const { theme } = useTheme()
  const sdk = useSDK()
  const dialog = useDialog()
  const sync = useSync()
  const toast = useToast()

  useKeyboard((evt) => {
    if (evt.name === "c" && !evt.ctrl && !evt.meta) {
      const code = /[A-Z0-9]{4}-[A-Z0-9]{4,5}/.exec(props.authorization.instructions)?.[0] ?? props.authorization.url
      Clipboard.copy(code)
        .then(() => {
          toast.show({ message: "Copied to clipboard", variant: "info" })
        })
        .catch(toast.error)
    }
  })

  void (async (): Promise<void> => {
    const result = await sdk.client.provider.oauth.callback({
      providerID: props.providerID,
      method: props.index,
    })
    if (result.error) {
      dialog.clear()
      return
    }
    await sdk.client.instance.dispose()
    await sync.bootstrap()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
    dialog.replace(() => <DialogModel providerID={props.providerID} />)
  })()

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {props.title}
        </text>
        <text
          fg={theme.textMuted}
          onMouseUp={() => {
            dialog.clear()
          }}
        >
          esc
        </text>
      </box>
      <box gap={1}>
        <Link href={props.authorization.url} fg={theme.primary} />
        <text fg={theme.textMuted}>{props.authorization.instructions}</text>
      </box>
      <text fg={theme.textMuted}>Waiting for authorization...</text>
      <text fg={theme.text}>
        c <span style={{ fg: theme.textMuted }}>copy</span>
      </text>
    </box>
  )
}

interface CodeMethodProps {
  index: number
  title: string
  providerID: string
  authorization: ProviderAuthAuthorization
}
function CodeMethod(props: CodeMethodProps): JSX.Element {
  const { theme } = useTheme()
  const sdk = useSDK()
  const sync = useSync()
  const dialog = useDialog()
  const [error, setError] = createSignal(false)

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
  return (
    <DialogPrompt
      title={props.title}
      placeholder="Authorization code"
      onConfirm={(value) => {
        void (async (): Promise<void> => {
          const { error } = await sdk.client.provider.oauth.callback({
            providerID: props.providerID,
            method: props.index,
            code: value,
          })
          if (!error) {
            await sdk.client.instance.dispose()
            await sync.bootstrap()
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
            dialog.replace(() => <DialogModel providerID={props.providerID} />)
            return
          }
          setError(true)
        })()
      }}
      description={() => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
        return (
          <box gap={1}>
            <text fg={theme.textMuted}>{props.authorization.instructions}</text>
            <Link href={props.authorization.url} fg={theme.primary} />
            <Show when={error()}>
              <text fg={theme.error}>Invalid code</text>
            </Show>
          </box>
        )
      }}
    />
  )
}

interface ApiMethodProps {
  providerID: string
  title: string
}
function ApiMethod(props: ApiMethodProps): JSX.Element {
  const dialog = useDialog()
  const sdk = useSDK()
  const sync = useSync()
  const { theme } = useTheme()

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
  return (
    <DialogPrompt
      title={props.title}
      placeholder="API key"
      description={
        (
          {
            opencode: (() => (
              // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
              <box gap={1}>
                <text fg={theme.textMuted}>
                  OpenCode Zen gives you access to all the best coding models at the cheapest prices with a single API
                  key.
                </text>
                <text fg={theme.text}>
                  Go to <span style={{ fg: theme.primary }}>https://opencode.ai/zen</span> to get a key
                </text>
              </box>
            )) as () => JSX.Element,
            "opencode-go": (() => (
              // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
              <box gap={1}>
                <text fg={theme.textMuted}>
                  OpenCode Go is a $10 per month subscription that provides reliable access to popular open coding
                  models with generous usage limits.
                </text>
                <text fg={theme.text}>
                  Go to <span style={{ fg: theme.primary }}>https://opencode.ai/zen</span> and enable OpenCode Go
                </text>
              </box>
            )) as () => JSX.Element,
          } as Record<string, (() => JSX.Element) | undefined>
        )[props.providerID] ?? undefined
      }
      onConfirm={(value) => {
        if (!value) return
        void (async (): Promise<void> => {
          await sdk.client.auth.set({
            providerID: props.providerID,
            auth: {
              type: "api",
              key: value,
            },
          })
          await sdk.client.instance.dispose()
          await sync.bootstrap()
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
          dialog.replace(() => <DialogModel providerID={props.providerID} />)
        })()
      }}
    />
  )
}

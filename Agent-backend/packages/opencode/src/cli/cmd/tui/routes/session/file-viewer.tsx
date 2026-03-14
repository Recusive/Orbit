import { readFileSync } from "fs"
import path from "path"

import { createMemo, For, Show } from "solid-js"

import { useTheme } from "../../context/theme"

import type { JSX } from "solid-js"

import { LANGUAGE_EXTENSIONS } from "@/lsp/language"

function filetype(input?: string): string {
  if (!input) return "none"
  const ext = path.extname(input)
  const language = LANGUAGE_EXTENSIONS[ext]
  if (["typescriptreact", "javascriptreact", "javascript"].includes(language)) return "typescript"
  return language
}

const MAX_FILE_SIZE = 512 * 1024
const MAX_LINES = 2000

export function FileViewer(props: {
  filePath: string | null
  tabs: string[]
  onSelectTab: (path: string) => void
  onCloseTab: (path: string) => void
  width?: number
}): JSX.Element {
  const { theme, syntax } = useTheme()

  const fileContent = createMemo(() => {
    if (!props.filePath) return null
    try {
      const buf = readFileSync(props.filePath)
      if (buf.length > MAX_FILE_SIZE) return "File too large to display"
      const content = buf.toString("utf-8")
      const lines = content.split("\n")
      if (lines.length > MAX_LINES) return lines.slice(0, MAX_LINES).join("\n") + "\n... truncated"
      return content
    } catch {
      return "Unable to read file"
    }
  })

  const ft = createMemo(() => filetype(props.filePath ?? undefined))

  const content = fileContent()
  const displayPath = createMemo((): string => {
    if (!props.filePath) return ""
    return path.relative(process.cwd(), props.filePath) || props.filePath
  })

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types unresolvable by ESLint type-checker
  return (
    <Show when={props.filePath && fileContent()}>
      <box
        backgroundColor={theme.backgroundPanel}
        width={props.width ?? 80}
        height="100%"
        paddingTop={0}
        paddingBottom={1}
      >
        <box flexShrink={0} flexDirection="row" paddingLeft={1} paddingTop={1} gap={1}>
          <For each={props.tabs}>
            {(tab) => {
              const active = (): boolean => tab === props.filePath
              const name = path.basename(tab)
              // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
              return (
                <box
                  flexDirection="row"
                  flexShrink={0}
                  backgroundColor={active() ? theme.backgroundElement : theme.background}
                  paddingTop={1}
                  paddingBottom={1}
                  paddingLeft={1}
                  paddingRight={1}
                  gap={1}
                >
                  <text
                    fg={active() ? theme.text : theme.textMuted}
                    onMouseDown={() => {
                      props.onSelectTab(tab)
                    }}
                  >
                    {active() ? <b>{name}</b> : name}
                  </text>
                  <text
                    fg={theme.textMuted}
                    onMouseDown={() => {
                      props.onCloseTab(tab)
                    }}
                  >
                    ✕
                  </text>
                </box>
              )
            }}
          </For>
        </box>
        <box flexShrink={0} paddingLeft={2} paddingRight={2} marginTop={1}>
          <text fg={theme.textMuted}>{displayPath()}</text>
        </box>
        <scrollbox
          flexGrow={1}
          paddingLeft={1}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }}
        >
          <Show when={content}>
            {(c) => (
              // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
              <line_number fg={theme.textMuted} minWidth={4} paddingRight={1}>
                <code conceal={false} fg={theme.text} filetype={ft()} syntaxStyle={syntax()} content={c()} />
              </line_number>
            )}
          </Show>
        </scrollbox>
      </box>
    </Show>
  )
}

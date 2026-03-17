import { readdirSync } from "fs"
import path from "path"

import { createSignal, createMemo, For, Show, onMount } from "solid-js"

import { useSync } from "../../context/sync"
import { useTheme } from "../../context/theme"

import type { JSX } from "solid-js"

const IGNORE = new Set([
  "node_modules",
  ".git",
  "__pycache__",
  ".next",
  ".turbo",
  ".cache",
  ".venv",
  "venv",
  "dist",
  "build",
  "target",
  ".idea",
  ".vscode",
  ".zig-cache",
  "coverage",
  ".coverage",
  ".DS_Store",
])

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children?: TreeNode[]
}

function readDir(dirPath: string, depth: number): TreeNode[] {
  if (depth > 4) return []
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true })
    const nodes: TreeNode[] = []

    const sorted = entries
      .filter((e) => !IGNORE.has(e.name) && !e.name.startsWith("."))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })

    for (const entry of sorted) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          path: fullPath,
          isDir: true,
        })
      } else {
        nodes.push({
          name: entry.name,
          path: fullPath,
          isDir: false,
        })
      }
    }
    return nodes
  } catch {
    return []
  }
}

function FileNode(props: { node: TreeNode; depth: number; onFileOpen?: (path: string) => void }): JSX.Element {
  const { theme } = useTheme()
  const [expanded, setExpanded] = createSignal(props.depth < 1)
  const children = createMemo(() => {
    if (!props.node.isDir || !expanded()) return []
    return readDir(props.node.path, props.depth + 1)
  })

  const icon = createMemo(() => {
    if (!props.node.isDir) return "  "
    return expanded() ? "▼ " : "▶ "
  })

  const fg = createMemo(() => {
    if (props.node.isDir) return theme.text
    return theme.textMuted
  })

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types unresolvable by ESLint type-checker
  return (
    <box flexShrink={0}>
      <text
        fg={fg()}
        onMouseDown={() => {
          if (props.node.isDir) {
            setExpanded(!expanded())
          } else {
            props.onFileOpen?.(props.node.path)
          }
        }}
      >
        {"  ".repeat(props.depth)}{icon()}{props.node.name}{props.node.isDir ? "/" : ""}
      </text>
      <Show when={expanded() && props.node.isDir}>
        <For each={children()}>
          {/* eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types */}
          {(child) => <FileNode node={child} depth={props.depth + 1} onFileOpen={props.onFileOpen} />}
        </For>
      </Show>
    </box>
  )
}

export function FileTree(props: { onFileOpen?: (path: string) => void; width?: number }): JSX.Element {
  const { theme } = useTheme()
  const sync = useSync()
  const directory = createMemo(() => sync.data.path.directory || process.cwd())
  const dirName = createMemo(() => path.basename(directory()))
  const [nodes, setNodes] = createSignal<TreeNode[]>([])

  onMount(() => {
    setNodes(readDir(directory(), 0))
  })

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types unresolvable by ESLint type-checker
  return (
    <box
      backgroundColor={theme.backgroundPanel}
      width={props.width ?? 32}
      height="100%"
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={1}
      paddingRight={1}
    >
      <box flexShrink={0} marginBottom={1} paddingLeft={1}>
        <text fg={theme.text}>
          <b>{dirName()}</b>
        </text>
      </box>
      <scrollbox
        flexGrow={1}
        verticalScrollbarOptions={{
          trackOptions: {
            backgroundColor: theme.background,
            foregroundColor: theme.borderActive,
          },
        }}
      >
        <For each={nodes()}>
          {/* eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types */}
          {(node) => <FileNode node={node} depth={0} onFileOpen={props.onFileOpen} />}
        </For>
      </scrollbox>
    </box>
  )
}

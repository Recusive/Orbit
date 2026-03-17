import path from "path"

import {  applyEdits, modify, parse as parseJsonc } from "jsonc-parser"
import { unique } from "remeda"
import z from "zod"

import { ConfigPaths } from "./paths"
import { TuiInfo, TuiOptions } from "./tui-schema"

import type {ParseError as JsoncParseError} from "jsonc-parser";

import { Flag } from "@/flag/flag"
import { Global } from "@/global"
import { Instance } from "@/project/instance"
import { Filesystem } from "@/util/filesystem"
import { Log } from "@/util/log"

const log = Log.create({ service: "tui.migrate" })

const TUI_SCHEMA_URL = "https://opencode.ai/tui.json"

const LegacyTheme = TuiInfo.shape.theme.optional()
const LegacyRecord = z.record(z.string(), z.unknown()).optional()

const TuiLegacy = z
  .object({
    scroll_speed: TuiOptions.shape.scroll_speed.catch(undefined),
    scroll_acceleration: TuiOptions.shape.scroll_acceleration.catch(undefined),
    diff_style: TuiOptions.shape.diff_style.catch(undefined),
  })
  .strip()

interface MigrateInput {
  directories: string[]
  custom?: string
  managed: string
}

/**
 * Migrates tui-specific keys (theme, keybinds, tui) from opencode.json files
 * into dedicated tui.json files. Migration is performed per-directory and
 * skips only locations where a tui.json already exists.
 */
export async function migrateTuiConfig(input: MigrateInput): Promise<void> {
  const opencode = opencodeFiles(input)
  for (const file of opencode) {
    const source = await Filesystem.readText(file).catch((error: unknown) => {
      log.warn("failed to read config for tui migration", { path: file, error })
      return undefined
    })
    if (source === undefined) continue
    const errors: JsoncParseError[] = []
    const data: unknown = parseJsonc(source, errors, { allowTrailingComma: true })
    if (errors.length > 0 || data === null || data === undefined || typeof data !== "object" || Array.isArray(data))
      continue
    const record = data as Record<string, unknown>

    const theme = LegacyTheme.safeParse("theme" in record ? record.theme : undefined)
    const keybinds = LegacyRecord.safeParse("keybinds" in record ? record.keybinds : undefined)
    const legacyTui = LegacyRecord.safeParse("tui" in record ? record.tui : undefined)
    const extracted = {
      theme: theme.success ? theme.data : undefined,
      keybinds: keybinds.success ? keybinds.data : undefined,
      tui: legacyTui.success ? legacyTui.data : undefined,
    }
    const tui = extracted.tui ? normalizeTui(extracted.tui) : undefined
    if (extracted.theme === undefined && extracted.keybinds === undefined && !tui) continue

    const target = path.join(path.dirname(file), "tui.json")
    const targetExists = Filesystem.exists(target)
    if (targetExists) continue

    const payload: Record<string, unknown> = {
      $schema: TUI_SCHEMA_URL,
    }
    if (extracted.theme !== undefined) payload.theme = extracted.theme
    if (extracted.keybinds !== undefined) payload.keybinds = extracted.keybinds
    if (tui) Object.assign(payload, tui)

    const wrote = await Filesystem.write(target, JSON.stringify(payload, null, 2))
      .then(() => true)
      .catch((error: unknown) => {
        log.warn("failed to write tui migration target", { from: file, to: target, error })
        return false
      })
    if (!wrote) continue

    const stripped = await backupAndStripLegacy(file, source)
    if (!stripped) {
      log.warn("tui config migrated but source file was not stripped", { from: file, to: target })
      continue
    }
    log.info("migrated tui config", { from: file, to: target })
  }
}

function normalizeTui(data: Record<string, unknown>): z.output<typeof TuiLegacy> | undefined {
  const parsed = TuiLegacy.parse(data)
  if (
    parsed.scroll_speed === undefined &&
    parsed.diff_style === undefined &&
    parsed.scroll_acceleration === undefined
  ) {
    return
  }
  return parsed
}

async function backupAndStripLegacy(file: string, source: string): Promise<boolean> {
  const backup = file + ".tui-migration.bak"
  const hasBackup = Filesystem.exists(backup)
  const backed = hasBackup
    ? true
    : await Filesystem.write(backup, source)
        .then(() => true)
        .catch((error: unknown) => {
          log.warn("failed to backup source config during tui migration", { path: file, backup, error })
          return false
        })
  if (!backed) return false

  const text = ["theme", "keybinds", "tui"].reduce((acc, key) => {
    const edits = modify(acc, [key], undefined, {
      formattingOptions: {
        insertSpaces: true,
        tabSize: 2,
      },
    })
    if (!edits.length) return acc
    return applyEdits(acc, edits)
  }, source)

  return Filesystem.write(file, text)
    .then(() => {
      log.info("stripped tui keys from server config", { path: file, backup })
      return true
    })
    .catch((error: unknown) => {
      log.warn("failed to strip legacy tui keys from server config", { path: file, backup, error })
      return false
    })
}

function opencodeFiles(input: { directories: string[]; managed: string }): string[] {
  const project = Flag.OPENCODE_DISABLE_PROJECT_CONFIG
    ? []
    : ConfigPaths.projectFiles("orbit", Instance.directory, Instance.worktree)
  const files = [...project, ...ConfigPaths.fileInDirectory(Global.Path.config, "orbit")]
  for (const dir of unique(input.directories)) {
    files.push(...ConfigPaths.fileInDirectory(dir, "orbit"))
  }
  if (Flag.OPENCODE_CONFIG) files.push(Flag.OPENCODE_CONFIG)
  files.push(...ConfigPaths.fileInDirectory(input.managed, "orbit"))

  return unique(files).filter((file) => Filesystem.exists(file))
}

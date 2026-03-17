import os from "os"
import path from "path"

import { NamedError } from "@opencode-ai/util/error"
import {  parse as parseJsonc, printParseErrorCode } from "jsonc-parser"
import z from "zod"

import type {ParseError as JsoncParseError} from "jsonc-parser";

import { Flag } from "@/flag/flag"
import { Global } from "@/global"
import { Filesystem } from "@/util/filesystem"

export namespace ConfigPaths {
  export function projectFiles(name: string, directory: string, worktree: string): string[] {
    const files: string[] = []
    for (const file of [`${name}.jsonc`, `${name}.json`]) {
      const found = Filesystem.findUp(file, directory, worktree)
      for (const resolved of found.toReversed()) {
        files.push(resolved)
      }
    }
    return files
  }

  export async function directories(directory: string, worktree: string): Promise<string[]> {
    return [
      Global.Path.config,
      ...(!Flag.OPENCODE_DISABLE_PROJECT_CONFIG
        ? await Array.fromAsync(
            Filesystem.up({
              targets: [".orbit"],
              start: directory,
              stop: worktree,
            }),
          )
        : []),
      ...(await Array.fromAsync(
        Filesystem.up({
          targets: [".orbit"],
          start: Global.Path.home,
          stop: Global.Path.home,
        }),
      )),
      ...(Flag.OPENCODE_CONFIG_DIR ? [Flag.OPENCODE_CONFIG_DIR] : []),
    ]
  }

  export function fileInDirectory(dir: string, name: string): string[] {
    return [path.join(dir, `${name}.jsonc`), path.join(dir, `${name}.json`)]
  }

  export const JsonError = NamedError.create(
    "ConfigJsonError",
    z.object({
      path: z.string(),
      message: z.string().optional(),
    }),
  )

  export const InvalidError = NamedError.create(
    "ConfigInvalidError",
    z.object({
      path: z.string(),
      issues: z.custom<z.core.$ZodIssue[]>().optional(),
      message: z.string().optional(),
    }),
  )

  /** Read a config file, returning undefined for missing files and throwing JsonError for other failures. */
  export async function readFile(filepath: string): Promise<string | undefined> {
    return Filesystem.readText(filepath).catch((err: unknown) => {
      if (err instanceof Error && "code" in err && err.code === "ENOENT") return undefined
      throw new JsonError({ path: filepath }, { cause: err })
    })
  }

  type ParseSource = string | { source: string; dir: string }

  function source(input: ParseSource): string {
    return typeof input === "string" ? input : input.source
  }

  function dir(input: ParseSource): string {
    return typeof input === "string" ? path.dirname(input) : input.dir
  }

  /** Apply {env:VAR} and {file:path} substitutions to config text. */
  async function substitute(text: string, input: ParseSource, missing: "error" | "empty" = "error"): Promise<string> {
    text = text.replace(/\{env:([^}]+)\}/g, (_, varName: string) => {
      return process.env[varName] ?? ""
    })

    const fileMatches = Array.from(text.matchAll(/\{file:[^}]+\}/g))
    if (!fileMatches.length) return text

    const configDir = dir(input)
    const configSource = source(input)
    let out = ""
    let cursor = 0

    for (const match of fileMatches) {
      const token = match[0]
      const index = match.index
      out += text.slice(cursor, index)

      const lineStart = text.lastIndexOf("\n", index - 1) + 1
      const prefix = text.slice(lineStart, index).trimStart()
      if (prefix.startsWith("//")) {
        out += token
        cursor = index + token.length
        continue
      }

      let filePath = token.replace(/^\{file:/, "").replace(/\}$/, "")
      if (filePath.startsWith("~/")) {
        filePath = path.join(os.homedir(), filePath.slice(2))
      }

      const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(configDir, filePath)
      const fileContent = (
        await Filesystem.readText(resolvedPath).catch((error: unknown) => {
          if (missing === "empty") return ""

          const errMsg = `bad file reference: "${token}"`
          if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            throw new InvalidError(
              {
                path: configSource,
                message: errMsg + ` ${resolvedPath} does not exist`,
              },
              { cause: error },
            )
          }
          throw new InvalidError({ path: configSource, message: errMsg }, { cause: error })
        })
      ).trim()

      out += JSON.stringify(fileContent).slice(1, -1)
      cursor = index + token.length
    }

    out += text.slice(cursor)
    return out
  }

  /** Substitute and parse JSONC text, throwing JsonError on syntax errors. */
  export async function parseText(text: string, input: ParseSource, missing: "error" | "empty" = "error"): Promise<unknown> {
    const configSource = source(input)
    text = await substitute(text, input, missing)

    const errors: JsoncParseError[] = []
    const data: unknown = parseJsonc(text, errors, { allowTrailingComma: true })
    if (errors.length > 0) {
      const lines = text.split("\n")
      const errorDetails = errors
        .map((e) => {
          const beforeOffset = text.substring(0, e.offset).split("\n")
          const line = beforeOffset.length
          const column = beforeOffset[beforeOffset.length - 1].length + 1
          const problemLine = lines[line - 1]

          const error = `${printParseErrorCode(e.error)} at line ${String(line)}, column ${String(column)}`
          if (!problemLine) return error

          return `${error}\n   Line ${String(line)}: ${problemLine}\n${"".padStart(column + 9)}^`
        })
        .join("\n")

      throw new JsonError({
        path: configSource,
        message: `\n--- JSONC Input ---\n${text}\n--- Errors ---\n${errorDetails}\n--- End ---`,
      })
    }

    return data
  }
}

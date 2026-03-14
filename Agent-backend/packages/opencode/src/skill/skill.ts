import os from "os"
import path from "path"

import { NamedError } from "@orbit.build/util/error"
import z from "zod"

import { Config } from "../config/config"
import { ConfigMarkdown } from "../config/markdown"
import { Instance } from "../project/instance"
import { Glob } from "../util/glob"
import { Log } from "../util/log"

import { Discovery } from "./discovery"

import { Bus } from "@/bus"
import { Flag } from "@/flag/flag"
import { Global } from "@/global"
import { Session } from "@/session"
import { Filesystem } from "@/util/filesystem"

export namespace Skill {
  const log = Log.create({ service: "skill" })
  export const Info = z.object({
    name: z.string(),
    description: z.string(),
    location: z.string(),
    content: z.string(),
  })
  export type Info = z.infer<typeof Info>

  export const InvalidError = NamedError.create(
    "SkillInvalidError",
    z.object({
      path: z.string(),
      message: z.string().optional(),
      issues: z.custom<z.core.$ZodIssue[]>().optional(),
    }),
  )

  export const NameMismatchError = NamedError.create(
    "SkillNameMismatchError",
    z.object({
      path: z.string(),
      expected: z.string(),
      actual: z.string(),
    }),
  )

  // External skill directories to search for (project-level and global)
  // These follow the directory layout used by Claude Code and other agents.
  const EXTERNAL_DIRS = [".claude", ".agents"]
  const EXTERNAL_SKILL_PATTERN = "skills/**/SKILL.md"
  const OPENCODE_SKILL_PATTERN = "{skill,skills}/**/SKILL.md"
  const SKILL_PATTERN = "**/SKILL.md"

  export const state = Instance.state(async () => {
    const skills: Record<string, Info> = {}
    const dirs = new Set<string>()

    const addSkill = async (match: string): Promise<void> => {
      const md = await ConfigMarkdown.parse(match).catch((err: unknown) => {
        const message = ConfigMarkdown.FrontmatterError.isInstance(err)
          ? (err as InstanceType<typeof ConfigMarkdown.FrontmatterError>).data.message
          : `Failed to parse skill ${match}`
        void Bus.publish(Session.Event.Error, {
          error: new NamedError.Unknown({ message }).toObject() as { name: "UnknownError"; data: { message: string } },
        })
        log.error("failed to load skill", { skill: match, err })
        return undefined
      })

      if (md === undefined) return

      const parsed = Info.pick({ name: true, description: true }).safeParse(md.data)
      if (!parsed.success) return

      // Warn on duplicate skill names
      if (parsed.data.name in skills) {
        log.warn("duplicate skill name", {
          name: parsed.data.name,
          existing: skills[parsed.data.name].location,
          duplicate: match,
        })
      }

      dirs.add(path.dirname(match))

      skills[parsed.data.name] = {
        name: parsed.data.name,
        description: parsed.data.description,
        location: match,
        content: md.content,
      }
    }

    const scanExternal = async (root: string, scope: "global" | "project"): Promise<void> => {
      return Glob.scan(EXTERNAL_SKILL_PATTERN, {
        cwd: root,
        absolute: true,
        include: "file",
        dot: true,
        symlink: true,
      })
        .then((matches) => Promise.all(matches.map(addSkill)).then(() => undefined))
        .catch((error: unknown) => {
          log.error(`failed to scan ${scope} skills`, { dir: root, error })
        })
    }

    // Scan external skill directories (.claude/skills/, .agents/skills/, etc.)
    // Load global (home) first, then project-level (so project-level overwrites)
    if (!Flag.OPENCODE_DISABLE_EXTERNAL_SKILLS) {
      for (const dir of EXTERNAL_DIRS) {
        const root = path.join(Global.Path.home, dir)
        if (!Filesystem.isDir(root)) continue
        await scanExternal(root, "global")
      }

      for (const root of Filesystem.up({
        targets: EXTERNAL_DIRS,
        start: Instance.directory,
        stop: Instance.worktree,
      })) {
        await scanExternal(root, "project")
      }
    }

    // Scan .orbit/skill/ directories
    for (const dir of await Config.directories()) {
      const matches = await Glob.scan(OPENCODE_SKILL_PATTERN, {
        cwd: dir,
        absolute: true,
        include: "file",
        symlink: true,
      })
      for (const match of matches) {
        await addSkill(match)
      }
    }

    // Scan additional skill paths from config
    const config = await Config.get()
    for (const skillPath of config.skills?.paths ?? []) {
      const expanded = skillPath.startsWith("~/") ? path.join(os.homedir(), skillPath.slice(2)) : skillPath
      const resolved = path.isAbsolute(expanded) ? expanded : path.join(Instance.directory, expanded)
      if (!Filesystem.isDir(resolved)) {
        log.warn("skill path not found", { path: resolved })
        continue
      }
      const matches = await Glob.scan(SKILL_PATTERN, {
        cwd: resolved,
        absolute: true,
        include: "file",
        symlink: true,
      })
      for (const match of matches) {
        await addSkill(match)
      }
    }

    // Download and load skills from URLs
    for (const url of config.skills?.urls ?? []) {
      const list = await Discovery.pull(url)
      for (const dir of list) {
        dirs.add(dir)
        const matches = await Glob.scan(SKILL_PATTERN, {
          cwd: dir,
          absolute: true,
          include: "file",
          symlink: true,
        })
        for (const match of matches) {
          await addSkill(match)
        }
      }
    }

    return {
      skills,
      dirs: Array.from(dirs),
    }
  })

  export async function get(name: string): Promise<Info | undefined> {
    return state().then((x) => x.skills[name])
  }

  export async function all(): Promise<Info[]> {
    return state().then((x) => Object.values(x.skills))
  }

  export async function dirs(): Promise<string[]> {
    return state().then((x) => x.dirs)
  }
}

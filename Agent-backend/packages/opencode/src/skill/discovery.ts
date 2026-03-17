import { mkdir } from "fs/promises"
import path from "path"

import { Global } from "../global"
import { Filesystem } from "../util/filesystem"
import { Log } from "../util/log"

export namespace Discovery {
  const log = Log.create({ service: "skill-discovery" })

  interface Index {
    skills: {
      name: string
      description: string
      files: string[]
    }[]
  }

  export function dir(): string {
    return path.join(Global.Path.cache, "skills")
  }

  async function get(url: string, dest: string): Promise<boolean> {
    if (Filesystem.exists(dest)) return true
    return fetch(url)
      .then(async (response) => {
        if (!response.ok) {
          log.error("failed to download", { url, status: response.status })
          return false
        }
        if (response.body) await Filesystem.writeStream(dest, response.body)
        return true
      })
      .catch((err: unknown) => {
        log.error("failed to download", { url, err })
        return false
      })
  }

  export async function pull(url: string): Promise<string[]> {
    const result: string[] = []
    const base = url.endsWith("/") ? url : `${url}/`
    const index = new URL("index.json", base).href
    const cache = dir()
    const host = base.slice(0, -1)

    log.info("fetching index", { url: index })
    const data = await fetch(index)
      .then(async (response) => {
        if (!response.ok) {
          log.error("failed to fetch index", { url: index, status: response.status })
          return undefined
        }
        return response
          .json()
          .then((json: unknown) => json as Index)
          .catch((err: unknown) => {
            log.error("failed to parse index", { url: index, err })
            return undefined
          })
      })
      .catch((err: unknown) => {
        log.error("failed to fetch index", { url: index, err })
        return undefined
      })

    if (!data || !Array.isArray(data.skills)) {
      log.warn("invalid index format", { url: index })
      return result
    }

    const list = data.skills.filter((skill) => {
      if (!skill.name || !Array.isArray(skill.files)) {
        log.warn("invalid skill entry", { url: index, skill })
        return false
      }
      return true
    })

    await Promise.all(
      list.map(async (skill) => {
        const root = path.join(cache, skill.name)
        await Promise.all(
          skill.files.map(async (file) => {
            const link = new URL(file, `${host}/${skill.name}/`).href
            const dest = path.join(root, file)
            await mkdir(path.dirname(dest), { recursive: true })
            await get(link, dest)
          }),
        )

        const md = path.join(root, "SKILL.md")
        if (Filesystem.exists(md)) result.push(root)
      }),
    )

    return result
  }
}

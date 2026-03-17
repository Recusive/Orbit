import { Instance } from "../project/instance"

export namespace Env {
  const state = Instance.state(() => {
    // Create a shallow copy to isolate environment per instance
    // Prevents parallel tests from interfering with each other's env vars
    return { ...process.env } as Record<string, string | undefined>
  })

  export function get(key: string): string | undefined {
    const env = state()
    return env[key]
  }

  export function all(): Record<string, string | undefined> {
    return state()
  }

  export function set(key: string, value: string): void {
    const env = state()
    env[key] = value
  }

  export function remove(key: string): void {
    const env = state()
    // Use Reflect.deleteProperty instead of dynamic delete
    Reflect.deleteProperty(env, key)
  }
}

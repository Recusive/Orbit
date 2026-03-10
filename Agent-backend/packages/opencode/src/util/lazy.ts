export function lazy<T>(fn: () => T): (() => T) & { reset: () => void } {
  let value: T | undefined
  let loaded = false

  const result = (): T => {
    if (loaded) return value as T
    value = fn()
    loaded = true
    return value
  }

  result.reset = () => {
    loaded = false
    value = undefined
  }

  return result
}

export function signal(): { trigger: () => void; wait: () => Promise<void> } {
  let resolve: (() => void) | undefined
  const promise = new Promise<void>((r) => (resolve = r))
  return {
    trigger() {
      resolve?.()
    },
    wait() {
      return promise
    },
  }
}

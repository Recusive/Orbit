declare module "@parcel/watcher/wrapper" {
  import type ParcelWatcher from "@parcel/watcher"
  export function createWrapper(binding: Record<string, unknown>): typeof ParcelWatcher
}

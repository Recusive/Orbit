export class AsyncQueue<T> implements AsyncIterable<T> {
  private queue: T[] = []
  private resolvers: ((value: T) => void)[] = []

  push(item: T): void {
    const resolve = this.resolvers.shift()
    if (resolve !== undefined) resolve(item)
    else this.queue.push(item)
  }

  async next(): Promise<T> {
    const item = this.queue.shift()
    if (item !== undefined) return item
    return new Promise((resolve) => this.resolvers.push(resolve))
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    for (;;) yield await this.next()
  }
}

export async function work<T>(concurrency: number, items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  const pending = [...items]
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (;;) {
        const item = pending.pop()
        if (item === undefined) return
        await fn(item)
      }
    }),
  )
}
